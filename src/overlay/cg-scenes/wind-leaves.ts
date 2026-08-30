/**
 * 场景 13 wind 的 ③ 被卷起的枯叶：cannon-es 薄片刚体沿尘卷螺旋上升。
 *
 * 规格要求「枯叶薄片刚体环绕轨迹」，所以这里不是脚本化的螺旋线插值，而是真刚体：
 * 每片叶子只受**气动力**（正比于气流与叶片的速度差）与重力，
 * 轨迹是这两者积分出来的——因此叶子会滞后于气流、被甩到漏斗壁外再吸回，
 * 这些细节脚本化路径给不出来。这也是本场景签名的后半句（全库唯一）。
 *
 * **旋转所在的平面**：叶子绕**竖直涡轴**在 xz 平面公转，同时沿 y 上升——
 * 这正是尘卷 mesh 的 SDF 所隐含的柱体（那里 x 是「离轴的横向距离」、y 是高度、
 * 方位角由 asin(x/radius) 反推），所以叶子贴的是**画出来的那面漏斗壁**。
 * 环境尘幕（./wind-streams）转的是屏幕平面——它是一层 Points 幕布，
 * 表达的是「整个环境在旋」这一签名；两者消费同一个 WhirlField，
 * 只是各自把「旋转」落在自己该在的平面上，共享的是场而不是平面。
 *
 * 独立成文件：物理世界的建立与同步逻辑与视觉元素无关，且受 250 行上限约束。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import type { WhirlField } from './wind-field';
import { AERO_K, leafAirVelocity } from './wind-aero';

/** 一片枯叶：视觉 mesh 与刚体一一绑定。 */
export type Leaf = { mesh: THREE.Mesh; body: Body };

/**
 * 场景时间 → 该时刻的风场。
 *
 * 传函数而不是传「当帧风场」：刚体是在时间上**积分**的，补齐若干固定步时
 * 每一步都必须看到自己那一刻的风。传单个快照的话，稀疏调用（测试跨 t 跳着调）
 * 会用同一份冻结的风跑掉几十步——涡轴不横扫，叶子被留在涡外拿不到气流，
 * 于是「沿螺旋线上升」在稀疏调用下静默失效，而密集调用下看起来是对的。
 */
export type WhirlFieldAt = (sceneSeconds: number) => WhirlField;

export interface LeafField {
  readonly group: THREE.Group;
  readonly leaves: readonly Leaf[];
  /** 按场景时间轴推进物理到 target 秒并同步位姿。 */
  update(fieldAt: WhirlFieldAt, target: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/** 物理步长固定 1/60（CLAUDE.md 的确定性步进要求）。 */
const FIXED_STEP = 1 / 60;
/** 单帧最多补齐的步数：防止极端跳帧时一次 update 跑满整幕物理。 */
const MAX_CATCHUP = 240;
/** 只与地面互撞的碰撞分组：多刚体近距生成时叶间穿透分离冲量会把它们炸飞。 */
const GROUP_GROUND = 1;
const GROUP_LEAF = 2;

/** 伪随机：同一 (i, salt) 每次一致，叶片散布因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

/** 枯叶薄片几何：薄扁长方体，厚度接近 0 才读作「叶」而非木块。 */
function leafGeometry(span: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(span * 2, span * 1.15, span * 0.12);
}

/**
 * 建立枯叶场。
 *
 * @param res 场景资源容器，几何/材质登记其中统一释放
 * @param ctx 场景上下文，quality 决定叶片数（§3.1 降档只减密度）
 * @param groundY 地面高度（局部坐标），与砂纹平面同高
 * @param anchorX 尘柱起始轴位，叶子绕它散布（与尘幕成员归属同锚）
 */
export function createLeafField(
  res: SceneResources, ctx: CgStageContext, groundY: number, anchorX: number,
): LeafField {
  const identity = MATERIAL_IDENTITIES.wind.physical;
  const short = Math.min(ctx.width, ctx.height);
  const group = new THREE.Group();
  group.name = 'whirl-leaves';
  group.position.z = 22;
  res.group.add(group);

  // 重力用像素量纲（正交相机下 1 世界单位 = 1 像素）。枯叶的 gravity 签名为
  // 正值（.03）表示「比常规更飘」，故基准重力压到 short 的 0.8 倍再按签名微调。
  const world = new World({
    gravity: new Vec3(0, -short * 0.8 * (1 - identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: false,
  });

  const ground = new Body({
    mass: 0, type: Body.STATIC, shape: new Plane(),
    collisionFilterGroup: GROUP_GROUND, collisionFilterMask: GROUP_LEAF,
  });
  ground.position.set(0, groundY, 0);
  // Plane 默认法线朝 +z，转到朝 +y 才是水平地面。
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const half = short * 0.014;
  const geometry = res.track(leafGeometry(half));
  const material = res.track(new THREE.MeshBasicMaterial({
    color: '#B98A4C', transparent: true, opacity: 0.9,
    blending: THREE.NormalBlending, depthWrite: false,
  }));

  const count = scaledCount(24, ctx.quality);
  const leaves: Leaf[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // 精确编号命名：`leaf-<i>` 与其它任何节点名互不为前缀，
    // 验收用 /^leaf-\d+$/ 精确收集，不会误把别的节点算成叶子。
    mesh.name = `leaf-${i}`;
    group.add(mesh);

    // 起始散布在贴地的一**圈**上（xz 平面），叶子是「被卷起」的，
    // 本来躺在旷野地面。方位角均分 + 抖动、半径各不同：
    // 同点生成会被 cannon 的穿透分离冲量炸飞。
    const theta = (i / count) * Math.PI * 2 + rand(i, 31) * 0.5;
    // 半径落在刚体核内：核内 falloff 恒为 1，上升气流满供，
    // 叶子从贴地起就能被抬起来，不必等涡心扫到自己头上。
    const radius = short * (0.06 + rand(i, 37) * 0.16);
    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half, half * 0.6, half * 0.06)),
      position: new Vec3(
        anchorX + Math.cos(theta) * radius,
        groundY + half + rand(i, 41) * short * 0.02,
        Math.sin(theta) * radius,
      ),
      // drag 签名（.998）转成线性阻尼：主阻力由 AERO_K 的气动力给，
      // 这里只留一点点数值稳定用的耗散。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.04,
      allowSleep: false,
      collisionFilterGroup: GROUP_LEAF, collisionFilterMask: GROUP_GROUND,
    });
    // 初速由 stiffness（.26）驱动。identity.force 是力的**类型枚举**（'vortex'），
    // 不是可乘的量级，当乘数用会算出 NaN 让刚体冻结。
    const kick = short * identity.stiffness * 0.35;
    body.velocity.set(-Math.sin(theta) * kick, kick * 0.3, Math.cos(theta) * kick);
    body.angularVelocity.set(rand(i, 47) * 6 - 3, rand(i, 53) * 6 - 3, rand(i, 59) * 8 - 4);
    world.addBody(body);
    leaves.push({ mesh, body });
  }

  let physicsElapsed = 0;

  const air = new Vec3();
  const force = new Vec3();
  const torque = new Vec3();

  return {
    group,
    leaves,

    update(fieldAt: WhirlFieldAt, target: number): void {
      let guard = 0;
      while (physicsElapsed + FIXED_STEP <= target && guard < MAX_CATCHUP) {
        // 每一步取**该步时刻**的风：涡轴在横扫，风力在起落，
        // 固定步长的积分必须逐步看新的风才不会积分出另一条轨迹。
        const wind = fieldAt(physicsElapsed);
        for (const { body } of leaves) {
          leafAirVelocity(wind, body, short * 0.4, air);
          // 气动力 F = m·k·(v_air − v_body)：叶片被气流推着走但有惯性滞后。
          // 直接改 velocity 会抹掉刚体属性（重力、碰撞冲量都失效）。
          force.set(
            (air.x - body.velocity.x) * AERO_K * body.mass,
            (air.y - body.velocity.y) * AERO_K * body.mass,
            (air.z - body.velocity.z) * AERO_K * body.mass,
          );
          body.applyForce(force);
          // 气流剪切给薄片翻滚力矩：真枯叶在旋风里是打着旋上升的。
          // 主分量绕 y（与公转同轴），叶面因此始终大致对着气流。
          torque.set(0, wind.omega * body.mass * 0.5, wind.omega * body.mass * 0.2);
          body.applyTorque(torque);
        }
        world.step(FIXED_STEP);
        physicsElapsed += FIXED_STEP;
        guard += 1;
        for (const { body } of leaves) {
          // cannon 的 Plane 只挡穿透不反弹：restitution 必须手动施加。
          // 枯叶 restitution 仅 .04——落地基本不跳，这才是叶子该有的手感。
          if (body.position.y <= groundY + half && body.velocity.y < 0) {
            body.position.y = groundY + half;
            body.velocity.y = -body.velocity.y * identity.restitution;
            body.velocity.x *= 1 - identity.friction;
            body.velocity.z *= 1 - identity.friction;
          }
        }
      }
      for (const { mesh, body } of leaves) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    setOpacity(value: number): void { material.opacity = value; },

    dispose(): void {
      for (const { body } of leaves) world.removeBody(body);
      world.removeBody(ground);
      leaves.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
