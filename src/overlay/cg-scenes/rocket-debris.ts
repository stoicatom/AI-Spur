/**
 * 场景 01 rocket 的 ⑤ 燃料碎屑层：cannon-es 小球刚体。
 *
 * 规格要求碎屑「落台弹跳」并「被音爆环扫动改变轨迹」，所以这里不是脚本化抛物线，
 * 而是真刚体：重力积分 + 台面碰撞 + 按 rocket 物理签名（air / restitution .18）反弹，
 * 音爆环则以一次真实冲量介入速度。独立成文件是因为物理世界的建立与同步逻辑
 * 与视觉元素无关，且受 250 行上限约束。
 */
import * as THREE from 'three';
import { Body, NaiveBroadphase, Plane, Sphere, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';

/** 一粒碎屑：视觉 mesh 与刚体一一绑定。 */
type DebrisPiece = {
  mesh: THREE.Mesh;
  body: Body;
  /** 是否已被音爆环扫过，环只推一次（波前扫过即离开）。 */
  swept: boolean;
};

export interface DebrisField {
  readonly group: THREE.Group;
  /** 点火：把碎屑从台面崩起，只生效一次。 */
  ignite(): void;
  /** 推进物理并把刚体位姿同步到 mesh。 */
  update(delta: number): void;
  /**
   * 音爆环扫动：波前半径经过谁就把谁推向外侧，返回累计被扫数。
   *
   * 传半径而非「已扩散多少」，是为了让扫动判定直接吃环的运行时真值，
   * 互动因此与环的实际几何同步，而不是各按自己的曲线演。
   */
  sweep(radius: number): number;
  /** 统一设置碎屑不透明度。 */
  setOpacity(value: number): void;
  dispose(): void;
}

/** 物理步长固定 1/60：与 CLAUDE.md 的确定性步进要求一致。 */
const FIXED_STEP = 1 / 60;

/**
 * 建立碎屑场。
 *
 * @param res 场景资源容器，几何/材质登记其中统一释放
 * @param ctx 场景上下文，quality 决定刚体数量（§3.1 低档减半）
 * @param scale 发射参考尺度（像素）
 * @param padY 台面高度（局部坐标），与发射台平台同高
 */
export function createDebrisField(
  res: SceneResources,
  ctx: CgStageContext,
  scale: number,
  padY: number,
): DebrisField {
  const identity = MATERIAL_IDENTITIES.rocket.physical;
  const group = new THREE.Group();
  group.name = 'fuel-debris';
  group.position.z = 12;
  // 被扫数从建场起就是真值 0，而不是「首次扫到才存在」：
  // 互动验收要能在环扩散前读到「还没扫到」，undefined 表达不了这件事。
  group.userData.sweptCount = 0;
  res.group.add(group);

  // 重力用像素量纲：正交相机下 1 世界单位 = 1 像素，取 scale 为长度尺度，
  // 让下落速度与画面尺寸解耦（大屏不会显得碎屑飘）。
  const world = new World({
    gravity: new Vec3(0, -scale * 14 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  // 台面：与发射台平台同高的静态平面。碰撞分组让碎屑只与台面互撞、彼此穿透
  // ——点火瞬间它们同处一小片区域，开启互撞会让分离冲量把碎屑弹向随机深度，
  // 而规格要的物理只是「落台弹跳」。
  const GROUP_PAD = 1;
  const GROUP_PIECE = 2;

  const pad = new Body({
    mass: 0,
    type: Body.STATIC,
    shape: new Plane(),
    collisionFilterGroup: GROUP_PAD,
    collisionFilterMask: GROUP_PIECE,
  });
  pad.position.set(0, padY, 0);
  // Plane 默认法线朝 +z，转到朝 +y 才是水平台面。
  pad.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(pad);

  const radius = scale * 0.032;
  const geometry = res.track(new THREE.SphereGeometry(radius, 8, 6));
  const material = res.track(additiveMaterial('#FFB878', 0));

  const count = scaledCount(30, ctx.quality);
  const pieces: DebrisPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `debris-${i}`;
    group.add(mesh);

    // 起始散布在台面上方一薄层：碎屑是被点火崩起的燃料残渣，不是从天而降。
    const spread = ((((i * 43) % 100) / 100) - 0.5) * scale * 2.2;
    const body = new Body({
      mass: identity.mass,
      shape: new Sphere(radius),
      position: new Vec3(spread, padY + radius * 2, 0),
      // drag 签名（.996）转成线性阻尼：数值越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.2,
      allowSleep: true,
      sleepSpeedLimit: scale * 0.04,
      collisionFilterGroup: GROUP_PIECE,
      collisionFilterMask: GROUP_PAD,
    });
    world.addBody(body);
    pieces.push({ mesh, body, swept: false });
  }

  let ignited = false;
  let accumulator = 0;
  let sweptCount = 0;
  const probe = new THREE.Vector3();

  return {
    group,

    ignite(): void {
      if (ignited) return;
      ignited = true;
      for (let i = 0; i < pieces.length; i += 1) {
        const { body } = pieces[i];
        // 斜向上崩飞：向上为主、横向分散，初速由 stiffness（推力刚度 .8）驱动。
        // force 是力的类型枚举（'thrust'），不是可乘的量级，别把它当乘数用。
        const lateral = ((((i * 37) % 100) / 100) - 0.5) * 2;
        const speed = scale * (5 + (((i * 29) % 100) / 100) * 4) * identity.stiffness;
        body.velocity.set(lateral * speed * 0.5, speed, 0);
        body.angularVelocity.set(0, 0, (((i * 19) % 100) / 100 - 0.5) * 10);
        body.wakeUp();
      }
    },

    update(delta: number): void {
      if (!ignited) return;
      // 固定步长累加：渲染帧率变化不会改变碎屑轨迹。
      accumulator = Math.min(accumulator + delta, FIXED_STEP * 6);
      while (accumulator >= FIXED_STEP) {
        world.step(FIXED_STEP);
        accumulator -= FIXED_STEP;
        for (const { body } of pieces) {
          // cannon 的 Plane 只挡住穿透，反弹要按 restitution 手动给：
          // 默认 ContactMaterial 无弹性，碎屑落台应该跳一下。
          if (body.position.y <= padY + radius && body.velocity.y < 0) {
            body.position.y = padY + radius;
            body.velocity.y = -body.velocity.y * (0.3 + identity.restitution);
            body.velocity.x *= 1 - identity.friction;
            body.wakeUp();
          }
        }
      }
      for (const { mesh, body } of pieces) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    sweep(radius: number): number {
      if (!ignited || radius <= 0) return sweptCount;
      for (const piece of pieces) {
        if (piece.swept) continue;
        piece.mesh.getWorldPosition(probe);
        // 环心在锥底、贴着台面，所以到波前的距离按「相对台面」量。
        const dx = probe.x;
        const dy = probe.y - padY;
        const distance = Math.hypot(dx, dy);
        if (distance > radius) continue;
        piece.swept = true;
        sweptCount += 1;
        // 记录被扫瞬间的横向位置：轨迹是否真被改变，验收时与之后的 x 对比。
        piece.mesh.userData.sweptX = probe.x;
        // 沿径向外推：波前把碎屑往外扫，横向分量占主导才看得出轨迹拐弯。
        const nx = distance < 1e-3 ? (piece.body.position.x >= 0 ? 1 : -1) : dx / distance;
        const push = scale * 9 * identity.stiffness;
        piece.body.velocity.x += nx * push;
        piece.body.velocity.y += Math.max(0, dy / Math.max(1e-3, distance)) * push * 0.3;
        piece.body.wakeUp();
      }
      group.userData.sweptCount = sweptCount;
      return sweptCount;
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of pieces) world.removeBody(body);
      world.removeBody(pad);
      pieces.length = 0;
      group.clear();
      group.removeFromParent();
    },
  };
}
