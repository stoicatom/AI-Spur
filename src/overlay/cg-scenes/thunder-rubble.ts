/**
 * 场景 11 thunder 的 ④ 碎石层：cannon-es 刚体被**冲击波抬升**。
 *
 * 独立成文件：刚体世界的建立与逐步同步跟「摆一批发光贴片」不是一件事，
 * 且 thunder-parts 已顶到 250 行上限（CLAUDE.md）。
 *
 * 与 bomb 的碎片、water 的卵石都不同的地方在**起跳的因由**：这里的碎石
 * 既不是同时起爆、也不是各自定时被推，而是各自**等自己所在半径上的
 * 环波前沿到达**。因此起跳时刻 = ringArrivalT(自身半径)，外圈石头必然
 * 更晚起跳、又因球面衰减跳得更矮——三个可见后果同出一条因果。
 *
 * 时变场必须**逐步采样**：追赶循环每一步都按该步时刻重算前沿位置与超压。
 * 取一次快照会让所有碎石在同一步以同一强度受力，密集调用下看着正常、
 * 稀疏 update 下立刻穿帮（本项目 wind 场景踩过这个坑）。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import {
  THUNDER_DURATION_S, frontOverpressure, progressToSeconds,
  rubbleAttenuation, shockRadius,
} from './thunder-shock';

/** 物理步长固定 1/60 秒（CLAUDE.md 的确定性步进要求）。 */
export const RUBBLE_STEP = 1 / 60;
/** 单次 update 最多补齐的步数：防止极端跳帧时一次跑满整幕物理。 */
const MAX_CATCHUP = 240;

/** 超压峰值加速度系数（× 画面短边）：最内圈碎石因此被掀起约 0.37 屏高。 */
const LIFT_ACCEL = 11;
/** 外推分量占抬升的比例：波把石头往外掀，但主要是掀起来。 */
const OUTWARD_RATIO = 0.3;
/**
 * 超压带宽（× reach）：波前过后这段距离内石头仍被推，越远越弱。
 *
 * 取 0.30 而非更窄的一条线，是因为固定步长下前沿每步走约 26px：带宽若与
 * 步长同量级，某块石头吃到几个超压步就取决于它的半径落在步格的哪个相位，
 * 相邻两块的起跳高度会阶梯式跳变（实测 0.16 时相邻两块差 2.5 倍）。
 * 带宽跨十来步后，相位量化被摊平，起跳高度才随距离平滑衰减。
 */
const BAND_RATIO = 0.3;

/** 一块碎石：视觉 mesh 与刚体一一绑定。 */
export type Rock = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 静止时所在的环半径（像素），决定它何时被波前扫到。 */
  readonly radius: number;
  /** 沿地面的横向符号：波往外掀。 */ readonly outward: number;
  /** 半边长（像素），落地夹紧用。 */ readonly half: number;
  /**
   * **实际**被抬起的时刻（归一化），未起跳为 -1。
   *
   * 起跳的判据是运行期「波前半径是否扫过本石半径」（见 advance），
   * 不存预期时刻：验收会用 ringArrivalT 独立算出期望值再与此比对，
   * 存一份预算值只会让人误以为起跳靠读它驱动。
   */
  liftedAt: number;
};

export interface RubbleField {
  readonly group: THREE.Group;
  readonly rocks: readonly Rock[];
  /** 推进物理到场景进度 t（内部固定步长追赶，逐步重采样波前）。 */
  advanceTo(t: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/** 伪随机：同一 (i, salt) 每次一致，碎石散布可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}
/**
 * 建立碎石场。
 *
 * @param res 场景资源容器，几何/材质登记其中统一释放
 * @param ctx 场景上下文，quality 决定碎石数（§3.1 降档只减密度）
 * @param groundY 地面高度（局部坐标），与环波同高
 * @param reach 屏心到最远缘的距离（像素），衰减律的尺度
 * @param speed 环波声速（像素 / 归一化幕）
 */
export function createRubbleField(
  res: SceneResources,
  ctx: CgStageContext,
  groundY: number,
  reach: number,
  speed: number,
): RubbleField {
  const identity = MATERIAL_IDENTITIES.thunder.physical;
  const short = Math.min(ctx.width, ctx.height);
  const group = new THREE.Group();
  group.name = 'rubble-field';
  group.position.z = 20;
  res.group.add(group);

  // 重力用像素量纲（正交相机下 1 世界单位 = 1 像素），取画面短边的倍数
  // 让手感与屏幕尺寸解耦。thunder 的 gravity 签名为 -.04（比常规略沉）。
  const world = new World({
    gravity: new Vec3(0, -short * 4.8 * (1 - identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  /**
   * 碎石**不与任何刚体碰撞**（mask 0），地面也不是 cannon 的 Plane。
   *
   * 两条各自的理由（与 water 的卵石同源）：
   *
   * 1. 彼此不撞——碎石沿地面密排，开启互撞时 cannon 的穿透分离冲量会把
   *    相邻两块弹到画面外（bomb 的实测事故），而且是 O(n²)。
   * 2. 地面不用 Plane——落地响应（夹紧 + 按 restitution 反弹）在下面解析
   *    给出，每个固定步结束时位置已钉在接触面上，Plane 的接触**永远不会**
   *    产生有意义的冲量；留着它反而会让穿透修正给出一点向上的速度噪声，
   *    把「石头真的弹了一下」和「求解器在推它」混成一笔。去掉之后
   *    restitution=0 的单步升幅严格为 0，反弹断言才有干净的判据。
   *
   * cannon 在此负责的是货真价实的部分：重力积分、线性/角阻尼、
   * 角速度→四元数姿态、睡眠，全部由 world.step 以固定 1/60 秒推进。
   */
  const GROUP_ROCK = 2;
  const COLLIDE_WITH_NOTHING = 0;

  const material = res.track(additiveMaterial('#8A93A6', 0));
  material.blending = THREE.NormalBlending;

  const count = scaledCount(30, ctx.quality);
  const rocks: Rock[] = [];
  for (let i = 0; i < count; i += 1) {
    const half = short * (0.006 + rand(i, 11) * 0.009);
    // 沿地面往两侧铺：半径从近震中到接近屏缘，波会依次扫过它们。
    const radius = reach * (0.07 + (i / Math.max(1, count - 1)) * 0.84);
    const outward = i % 2 === 0 ? 1 : -1;
    const x = outward * radius;
    const z = (rand(i, 19) - 0.5) * short * 0.06;

    const mesh = res.mesh(
      // `rock-<i>` 与本场景其它前缀互不包含，验收用 /^rock-\d+$/ 精确收集。
      `rock-${i}`,
      new THREE.BoxGeometry(half * 2, half * 2, half * 2),
      material,
    );
    mesh.position.set(x, groundY + half, z);
    group.add(mesh);

    const body = new Body({
      mass: identity.mass * (0.5 + rand(i, 23)),
      shape: new Box(new Vec3(half, half, half)),
      position: new Vec3(x, groundY + half, z),
        type: Body.STATIC, // 波未到之前躺在地上，不该自己滚。
      // drag 签名（.965）转成线性阻尼：数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.15,
      allowSleep: false,
      collisionFilterGroup: GROUP_ROCK,
      collisionFilterMask: COLLIDE_WITH_NOTHING,
    });
    world.addBody(body);
    rocks.push({ mesh, body, radius, outward, half, liftedAt: -1 });
  }

  const band = reach * BAND_RATIO;
  /** 已推进的物理秒数，追赶循环的游标。 */
  let elapsed = 0;
  const impulse = new Vec3();

  return {
    group,
    rocks,

    advanceTo(t: number): void {
      // 目标由**场景时间轴**折算，不用 frameDelta：后者为防跳帧压在 50ms
      // 上限，而 update 可能以任意 t 稀疏调用（跨 500ms 只推进 50ms，
      // 碎石永远等不到波前）。
      const target = progressToSeconds(t);
      let guard = 0;
      while (elapsed + RUBBLE_STEP <= target && guard < MAX_CATCHUP) {
        const stepS = elapsed + RUBBLE_STEP;
        // ★ 时变场逐步采样：用**当步**时刻的前沿，不是这一帧的快照。
        const stepT = stepS / THUNDER_DURATION_S;
        const front = shockRadius(stepT, 0, speed);
        for (const rock of rocks) {
          const push = frontOverpressure(front, rock.radius, band);
          if (push <= 0) continue;
          if (rock.body.type === Body.STATIC) {
            // 波前刚扫到这块石头：解除静止，记下真实起跳时刻。
            rock.body.type = Body.DYNAMIC;
            rock.body.updateMassProperties();
            rock.body.wakeUp();
            rock.liftedAt = stepT;
          }
          // 抬升由 stiffness（2.3）驱动，随距离按球面衰减。identity.force
          // 是力的**类型枚举**（'resonance'），不是可乘的量级——当乘数
          // 会算出 NaN 让全部刚体冻结。
          const accel = short * LIFT_ACCEL * identity.stiffness
            * rubbleAttenuation(rock.radius, reach) * push;
          // 冲量 = m·a·dt：直接改 velocity 会抹掉刚体属性。
          const scaleImp = rock.body.mass * accel * RUBBLE_STEP;
          impulse.set(rock.outward * scaleImp * OUTWARD_RATIO, scaleImp, 0);
          rock.body.applyImpulse(impulse);
          rock.body.angularVelocity.set(
            (rand(rock.radius, 3) - 0.5) * 9,
            (rand(rock.radius, 7) - 0.5) * 9,
            -rock.outward * push * 7,
          );
        }

        world.step(RUBBLE_STEP);
        elapsed = stepS;
        guard += 1;

        for (const rock of rocks) {
          if (rock.body.type === Body.STATIC) continue;
          const rest = groundY + rock.half;
          // 地面接触**完全**在这里给：夹紧 + 按 restitution 翻转竖直速度。
          // thunder 的 restitution 是 .12——石头落地只跳一小下就停。
          if (rock.body.position.y <= rest && rock.body.velocity.y < 0) {
            rock.body.position.y = rest;
            rock.body.velocity.y = -rock.body.velocity.y * identity.restitution;
            rock.body.velocity.x *= 1 - identity.friction;
            rock.body.velocity.z *= 1 - identity.friction;
          }
        }
      }

      for (const rock of rocks) {
        // 位姿原样抄自刚体：显示层再夹一次地面会把「没穿透」变成一句
        // 显示层的谎，验收就测不到物理（water 场景已证实）。
        const p = rock.body.position;
        rock.mesh.position.set(p.x, p.y, p.z);
        const q = rock.body.quaternion;
        rock.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const rock of rocks) world.removeBody(rock.body);
      rocks.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
