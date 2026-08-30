/**
 * 场景 14 star 的 ③ 星屑层：cannon-es 小颗粒，具弹跳。
 *
 * 与 meteor 的「沿轨迹陆续剥离」不同：星屑是**星体炸开那一刻同时**
 * 沿五轴散出的一把碎粒，落地后按 star 的弹性签名（restitution .62）
 * 反复弹跳——五轴里 stone/elastic 的组合让它比 meteor 的石屑跳得高。
 *
 * 互动② 环波推散星屑在这里成立：追赶循环**每一物理步**都重新采样
 * 环波半径（传进来的是函数不是快照），波前扫到某颗星屑所在半径时
 * 才给它一个向外的加速度。因此「推」的时刻由半径与位置共同决定，
 * 写成定时推散或把半径写成常量都会让因果消失。
 */
import * as THREE from 'three';
import { Body, NaiveBroadphase, Plane, Sphere, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { AXIS_COUNT, STAR_DURATION_S, axisDirection } from './star-signature';
import { jitter } from './star-field';

/** 物理步长固定 1/60：确定性步进，渲染帧率不影响星屑轨迹。 */
export const GRIT_STEP = 1 / 60;
/** 单次 update 最多追赶的物理步数，防止大跳时卡死。 */
const MAX_CATCHUP = 240;
/** 浮点容差：验收按整步推进时，累加误差不该让某一步被整格跳过。 */
const EPS = 1e-9;

const GROUP_GROUND = 1;
const GROUP_GRIT = 2;

/** 星屑同时散出的时刻（整幕归一化）＝ 星体炸开。 */
export const GRIT_RELEASE_AT = 200 / 1200;

/** 环波推散的作用带宽系数（× reach）：波前有厚度，不是一条数学线。 */
export const PUSH_BAND = 0.12;

/**
 * 波前对某半径处星屑的推力权重（0–1，纯函数）。
 *
 * 只有波前当前半径落在该星屑半径附近的窄带内才有值——
 * 「环波扫到才推」因此是曲线本身的性质，不靠调用顺序保证。
 *
 * @param radii 三圈环波当前半径（-1 表示不在场）
 * @param r 星屑到星心的距离（像素）
 * @param band 作用带宽（像素）
 */
export function pushWeight(radii: readonly number[], r: number, band: number): number {
  let best = 0;
  for (const radius of radii) {
    if (radius < 0) continue;
    best = Math.max(best, Math.max(0, 1 - Math.abs(radius - r) / band));
  }
  return best;
}

export type GritPiece = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
};

export interface GritField {
  readonly group: THREE.Group;
  readonly pieces: readonly GritPiece[];
  /**
   * 推进到目标时刻。
   *
   * @param t 整幕归一化进度（决定是否已散出）
   * @param radiiAt 归一化时刻 → 三圈环波半径。**传函数而非快照**：
   *   稀疏调用时追赶循环要在每一物理步上重新采样这个时变场，
   *   取一次快照会让整段追赶用同一个波前位置。
   */
  advance(t: number, radiiAt: (tNorm: number) => number[]): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建立星屑场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定颗粒数
 * @param scale 长度尺度（像素）
 * @param reach 全屏参考半径（像素），推散带宽与推力都以它为基准
 * @param groundY 地面高度（局部坐标）
 */
export function createGritField(
  res: SceneResources,
  ctx: CgStageContext,
  scale: number,
  reach: number,
  groundY: number,
): GritField {
  const identity = MATERIAL_IDENTITIES.star.physical;
  const group = new THREE.Group();
  group.name = 'grit-field';
  group.position.z = 6;
  res.group.add(group);

  const world = new World({
    // 像素量纲：正相机下 1 世界单位 = 1 像素。
    gravity: new Vec3(0, -scale * 26 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  // 地面：静态平面。碰撞分组让星屑只与地面互撞——全部刚体在散出前
  // 同处星心一点，开启彼此碰撞会被穿透分离冲量炸向随机深度
  // （本项目实测 z 冲到 ±1400，早已飞出画面）。
  const ground = new Body({
    mass: 0,
    type: Body.STATIC,
    shape: new Plane(),
    collisionFilterGroup: GROUP_GROUND,
    collisionFilterMask: GROUP_GRIT,
  });
  ground.position.set(0, groundY, 0);
  // Plane 默认法线朝 +z，转到朝 +y 才是水平地面。
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  const radius = scale * 0.055;
  const geometry = res.track(new THREE.SphereGeometry(radius, 7, 5));
  const material = res.track(additiveMaterial('#FFF0C0', 0));

  const count = scaledCount(34, ctx.quality);
  const pieces: GritPiece[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // `grit-` 与场景其它前缀（ray-/tip-/halo-/hoop-/speck-/relic-）
    // 两两不互相包含，`^grit-\d+$` 只会命中真刚体。
    mesh.name = `grit-${i}`;
    mesh.visible = false;
    group.add(mesh);

    const body = new Body({
      mass: identity.mass,
      shape: new Sphere(radius),
      position: new Vec3(0, 0, 0),
      // drag 签名（.989）转线性阻尼：越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.05,
      allowSleep: true,
      sleepSpeedLimit: scale * 0.03,
      collisionFilterGroup: GROUP_GRIT,
      collisionFilterMask: GROUP_GROUND,
    });
    world.addBody(body);
    body.sleep();
    pieces.push({ mesh, body });
  }

  const band = reach * PUSH_BAND;
  // 推散加速度：波前扫过的十分之一秒里能给出可观测的径向增速。
  const pushAccel = scale * 92;
  const floor = groundY + radius;
  let released = false;
  let elapsed = 0;

  function release(): void {
    released = true;
    for (let i = 0; i < pieces.length; i += 1) {
      const { mesh, body } = pieces[i];
      mesh.visible = true;
      // 沿五轴散出：每颗认领一条主轴，再加确定性抖动，
      // 因此星屑云也是五瓣的（与五轴对称同源）。
      const axis = axisDirection(i % AXIS_COUNT);
      const spread = (jitter(i, 4.2) - 0.5) * 0.72;
      const cos = Math.cos(spread);
      const sin = Math.sin(spread);
      const dx = axis.x * cos - axis.y * sin;
      const dy = axis.x * sin + axis.y * cos;
      // 初速由 stiffness（1.45）驱动。identity.force 是类型枚举字符串
      // （'elastic'）不是量级，当乘数用会算出 NaN 让全部刚体冻结。
      const speed = scale * 5.2 * identity.stiffness * (0.55 + jitter(i, 7.6) * 0.9);
      body.position.set(dx * scale * 0.35, dy * scale * 0.35, 0);
      body.velocity.set(dx * speed, dy * speed, 0);
      body.angularVelocity.set(0, 0, (jitter(i, 2.8) - 0.5) * 14);
      body.wakeUp();
    }
  }

  return {
    group,
    pieces,

    advance(t: number, radiiAt: (tNorm: number) => number[]): void {
      if (!released && t >= GRIT_RELEASE_AT) release();
      if (!released) return;

      const target = Math.max(0, t - GRIT_RELEASE_AT) * STAR_DURATION_S;
      let guard = 0;
      while (elapsed + GRIT_STEP <= target + EPS && guard < MAX_CATCHUP) {
        // 时变场逐步采样：环波在这一物理步所处的半径。
        const radii = radiiAt(GRIT_RELEASE_AT + elapsed / STAR_DURATION_S);
        for (const { body } of pieces) {
          const r = Math.hypot(body.position.x, body.position.y);
          // 互动② 波前扫到才推，方向沿径向朝外。
          const w = pushWeight(radii, r, band);
          if (w > 0 && r > 1e-3) {
            body.velocity.x += (body.position.x / r) * pushAccel * w * GRIT_STEP;
            body.velocity.y += (body.position.y / r) * pushAccel * w * GRIT_STEP;
            body.wakeUp();
          }
        }

        world.step(GRIT_STEP);
        elapsed += GRIT_STEP;
        guard += 1;

        for (const { body } of pieces) {
          // cannon 默认 ContactMaterial 无弹性，Plane 只挡穿透不反弹；
          // 反弹要按 restitution 手动施加，否则星屑落地不跳。
          if (body.position.y <= floor && body.velocity.y < 0) {
            body.position.y = floor;
            body.velocity.y = -body.velocity.y * identity.restitution;
            body.velocity.x *= 1 - identity.friction * 0.5;
          }
        }
      }

      for (const { mesh, body } of pieces) {
        mesh.position.set(body.position.x, body.position.y, 0);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
      }
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of pieces) world.removeBody(body);
      world.removeBody(ground);
    },
  };
}
