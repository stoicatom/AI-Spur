/**
 * 场景 20 drum 的 ⑤ 鼓皮粒子层：cannon-es 刚体在鼓面上弹跳。
 *
 * 坐标约定（与 bomb / meteor 的碎片场机制不同）：刚体活在**鼓面自身
 * 的两维**里——`x` 是沿鼓面的横向坐标，`y` 是**离开鼓面的高度**。
 * 屏幕位置 = 鼓心 +（x，homeDepth·压扁 + y）。这样「跳起来」与
 * 「被推远」是两个正交自由度，不会互相冒充：环波推的是 x，重力管的是 y。
 * 若把两者揉进屏幕 y，一颗被推向鼓缘的粒子看起来就跟跳起来一样。
 *
 * 与 bomb（同点起爆径向散开）、meteor（沿轨迹陆续剥离）都不同：
 * 这里全部粒子在**同一击**中被膜弹起，弹起强度按碗形剖面分布
 * ——鼓心的皮位移最大，那里的灰跳得最高。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Plane, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { DRUM_DURATION_S, DRUM_STRIKE_AT, sweepPush } from './drum-impact';
import { DRUM_SQUASH, bowlProfile } from './drum-parts';

/** 物理步长固定 1/60：确定性步进，渲染帧率不影响粒子轨迹。 */
const FIXED_STEP = 1 / 60;
/** 单帧最多追赶的物理步数，防止大跳时卡死。 */
const MAX_CATCHUP = 240;

const GROUP_HEAD = 1;
const GROUP_SKIN = 2;

/** 重力倍率（× 长度尺度）：鼓面上的灰起落要快，慢悠悠的抛物线不像被震起来。 */
const GRAVITY_K = 115;
/** 弹起初速倍率（× 长度尺度）。 */
const KICK_K = 28;
/**
 * 环波推粒子的加速度倍率（× 长度尺度），互动②的力度。
 *
 * 波前扫过一颗粒子只持续 ~28ms（不到两个物理步），加速度要够大
 * 单次通过才推得动；四层波依次扫过，粒子因此被连推四记。
 */
const PUSH_K = 230;

export type SkinParticle = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 鼓面深度坐标（俯视方向），恒定；屏幕 y 里它只贡献一个常数偏移。 */
  readonly homeDepth: number;
  /** 弹起强度系数（碗形剖面），鼓心最大。 */
  readonly kick: number;
};

export interface SkinField {
  readonly group: THREE.Group;
  readonly particles: readonly SkinParticle[];
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param sampleRadii 环波半径**采样函数**（不是快照）：追赶循环内逐
   *   物理步取值，否则一次跨几百毫秒的稀疏 update 会让整段扫掠用同一个
   *   半径，粒子要么全被推、要么全没被推。
   */
  advance(t: number, sampleRadii: (sceneT: number) => number[]): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建立鼓皮粒子场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定刚体数量
 * @param headRadius 鼓皮半径（像素）
 * @param scale 长度尺度（像素）
 */
export function createSkinField(
  res: SceneResources,
  ctx: CgStageContext,
  headRadius: number,
  scale: number,
): SkinField {
  const identity = MATERIAL_IDENTITIES.drum.physical;
  const { width, height } = ctx;
  const group = new THREE.Group();
  // 前缀与鼓面节点 `head-impact` 刻意不相交：`skin-` 只属于刚体，
  // 按 /^skin-\d+$/ 收集时不可能收到贴片。
  group.name = 'dust-field';
  group.position.z = 8;
  res.group.add(group);

  const gravity = scale * GRAVITY_K * (1 + identity.gravity);
  const world = new World({
    gravity: new Vec3(0, -gravity, 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: true,
  });

  // 鼓面：静态平面（body 空间 y=0），粒子在此反弹。
  // 碰撞分组让粒子只与鼓面互撞——粒子起始时挤在同一层，若开启互撞，
  // cannon 的穿透分离冲量会把它们炸飞。
  const membrane = new Body({
    mass: 0,
    type: Body.STATIC,
    shape: new Plane(),
    collisionFilterGroup: GROUP_HEAD,
    collisionFilterMask: GROUP_SKIN,
  });
  membrane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(membrane);

  const half = scale * 0.035;
  const geometry = res.track(new THREE.BoxGeometry(half * 2, half * 2, half * 2));
  const material = res.track(additiveMaterial('#E8CFA0'));
  material.blending = THREE.NormalBlending;
  material.opacity = 0;

  // 鼓皮是绷紧的膜：材料恢复系数被膜刚度放大，储存的弹性能还给粒子。
  // 直接用 identity.restitution（.18，木料对木料）会让灰落地即死，
  // 而战鼓皮上的灰是**连跳几下**的。
  const rebound = identity.restitution * (1 + identity.stiffness);

  const count = scaledCount(48, ctx.quality);
  const particles: SkinParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    // 黄金角螺旋铺满鼓面圆盘：i=0 落在 θ=0（深度恰为 0），
    // 竖直向断言取它就不会掺进深度偏移。
    const theta = i * 2.399963;
    const radius = headRadius * 0.92 * Math.sqrt((i + 0.5) / count);
    const homeX = radius * Math.cos(theta);
    const homeDepth = radius * Math.sin(theta);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `skin-${i}`;
    group.add(mesh);

    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half, half, half)),
      position: new Vec3(homeX, 0, 0),
      // drag 签名（.974）转线性阻尼：越接近 1 阻力越小。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.12,
      allowSleep: true,
      sleepSpeedLimit: scale * 0.05,
      collisionFilterGroup: GROUP_SKIN,
      collisionFilterMask: GROUP_HEAD,
    });
    world.addBody(body);
    body.sleep();

    particles.push({
      mesh,
      body,
      homeDepth,
      // 碗形剖面：鼓心的皮位移最大，那里的灰被弹得最高。
      kick: 0.5 + 0.5 * bowlProfile(radius / headRadius),
    });
  }

  // 环波扫掠用的 uv 尺度，必须与 shader 的度量一致
  // （d.y 先除以压扁系数，故深度方向按屏高归一）。
  const uvX = width * 1.6;
  const uvY = height * 1.6;
  const pushAccel = scale * PUSH_K;

  let struck = false;
  let physicsElapsed = 0;

  return {
    group,
    particles,

    advance(t: number, sampleRadii: (sceneT: number) => number[]): void {
      if (t < DRUM_STRIKE_AT) return;

      // 一击：全部粒子被膜同时弹起，强度按碗形剖面。
      if (!struck) {
        struck = true;
        for (const p of particles) {
          // 初速由 stiffness（2.45）驱动。identity.force 是力的类型枚举
          // 字符串（'resonance'），当乘数用会算出 NaN 让刚体冻结。
          p.body.velocity.set(0, scale * KICK_K * p.kick, 0);
          p.body.angularVelocity.set(0, 0, (p.homeDepth % 7) - 3.5);
          p.body.wakeUp();
        }
      }

      // 物理由场景时间轴驱动而非渲染 delta：验收会在稀疏 t 上调用，
      // 用 frameDelta（上限 50ms）会让物理几乎不前进。
      const target = Math.max(0, t - DRUM_STRIKE_AT) * DRUM_DURATION_S;
      let guard = 0;
      while (physicsElapsed + FIXED_STEP <= target && guard < MAX_CATCHUP) {
        // 时变场：环波半径在追赶循环内**逐步采样**，取快照会让扫掠丢失。
        const sceneT = DRUM_STRIKE_AT + physicsElapsed / DRUM_DURATION_S;
        const radii = sampleRadii(sceneT);

        for (const p of particles) {
          // 互动②：波前扫过粒子所在半径时，沿鼓面把它往外推。
          const sx = p.body.position.x;
          const rUv = Math.hypot(sx / uvX, p.homeDepth / uvY);
          let push = 0;
          for (const r of radii) push = Math.max(push, sweepPush(r, rUv));
          if (push > 0) {
            const dir = sx >= 0 ? 1 : -1;
            p.body.velocity.x += dir * pushAccel * push * FIXED_STEP;
            p.body.wakeUp();
          }
        }

        world.step(FIXED_STEP);
        physicsElapsed += FIXED_STEP;
        guard += 1;

        for (const { body } of particles) {
          // cannon 默认 ContactMaterial 无弹性，Plane 只挡穿透不反弹；
          // 反弹要按恢复系数手动施加，否则灰落面即死。
          if (body.position.y <= half && body.velocity.y < 0) {
            body.position.y = half;
            body.velocity.y = -body.velocity.y * rebound;
            // 摩擦只吃掉一小部分横向动量，否则环波推出的散布落地即停。
            body.velocity.x *= 1 - identity.friction * 0.25;
          }
        }
      }

      for (const p of particles) {
        // 屏幕位置：深度只贡献一个**常数** y 偏移，跳起高度是 body.y。
        p.mesh.position.set(
          p.body.position.x,
          p.homeDepth * DRUM_SQUASH + p.body.position.y,
          p.homeDepth * 0.02,
        );
        p.mesh.quaternion.set(
          p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w,
        );
      }
    },

    setOpacity(value: number): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of particles) world.removeBody(body);
      world.removeBody(membrane);
    },
  };
}
