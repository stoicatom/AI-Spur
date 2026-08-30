/**
 * 场景 29 lotus 的 ②花瓣刚体层：cannon-es 片状花瓣漂落水面。
 *
 * 这是本场景与 harp 的实体分界：harp 的花瓣是**音波轨迹**（`petalPath`
 * 纯函数画出来的装饰曲线），这里的花瓣是**可互动刚体**——有质量、
 * 受升力与水面浮力、落水后被表面张力托住并慢慢漂开。
 *
 * 释放时刻按层序**反向**排（外层先松脱，见 `petalReleaseAt`）：
 * 层叠因果在漂散阶段仍然成立，只是方向反过来。
 *
 * 片状体的关键不是形状而是**受力**：薄片下落时空气在两面产生压差，
 * 于是它一边下沉一边侧滑（升力），而不是像石子直落。用一个与水平速度
 * 正交的力表达这层空气动力学。
 */
import * as THREE from 'three';
import { Body, Box, NaiveBroadphase, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import type { SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { LOTUS_DURATION_S, LOTUS_LAYER_COUNT, petalReleaseAt } from './lotus-bloom';

/** 物理步长固定 1/60：确定性步进。 */
const FIXED_STEP = 1 / 60;
/** 单帧最多追赶的物理步数。 */
const MAX_CATCHUP = 240;
/** 花瓣互不碰撞（只受力场与水面约束），mask 置 0。 */
const COLLIDE_WITH_NOTHING = 0;
/** 电影级漂散花瓣数。 */
const DRIFT_PETAL_BUDGET = 18;

export type DriftPetal = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 来自哪一层：决定它何时脱落。 */
  readonly layer: number;
  /** 出发方位角（弧度）。 */
  readonly azimuth: number;
};

export interface PetalDrift {
  readonly group: THREE.Group;
  readonly petals: readonly DriftPetal[];
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param openAt 层开启度取值函数——**必须逐步采样**：取快照会让整个
   *   追赶循环里的开启度冻结，脱落时机与升力强度全错（本项目 wind /
   *   tornado 场景都踩过这个坑）。
   */
  advance(t: number, openAt: (sceneT: number, layer: number) => number): void;
  /** 整层不透明度（全部花瓣共用一份材质）。 */
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建漂散花瓣层。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定花瓣数
 * @param short 画面短边（像素），力场尺度基准
 * @param waterY 水面高度（局部 y）
 */
export function createPetalDrift(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
  waterY: number,
): PetalDrift {
  const identity = MATERIAL_IDENTITIES.lotus.physical;
  const group = new THREE.Group();
  group.name = 'petal-drift';
  res.group.add(group);
  // 嵌套容器由工具层递归清理负责，此处无需自己登记回收。

  // 重力弱：花瓣是 fabric 身份（mass 0.42、drag 0.994），
  // 空气阻力几乎抵掉重力，所以它飘而不是掉。
  const world = new World({
    gravity: new Vec3(0, -short * 0.42 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: false,
  });

  const petalLen = short * 0.055;
  const half = petalLen * 0.5;
  const geometry = res.track(new THREE.PlaneGeometry(petalLen * 0.42, petalLen));
  const material = res.track(new THREE.MeshBasicMaterial({
    color: ctx.color.clone().lerp(new THREE.Color('#FFCFE2'), 0.7),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  }));

  const count = scaledCount(DRIFT_PETAL_BUDGET, ctx.quality);
  const petals: DriftPetal[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // 前缀 `driftpetal-` 与莲座的 `seatpetal-` 互不包含。
    mesh.name = `driftpetal-${i}`;
    group.add(mesh);

    const layer = i % LOTUS_LAYER_COUNT;
    // 方位角均匀铺开，且叠一个层内偏移。
    const azimuth = (i / count) * Math.PI * 2 + layer * 0.4;
    // 起始半径按层递增：外层花瓣本来就在外圈。
    const startR = short * (0.12 + layer * 0.035);

    const body = new Body({
      mass: identity.mass,
      shape: new Box(new Vec3(half * 0.42, half, half * 0.08)),
      // 关键：**不能都从花心同点出发**——同点生成的刚体会互相炸飞。
      // 按方位角摊到各自的起始半径上，天然错开。
      position: new Vec3(
        Math.cos(azimuth) * startR,
        waterY + short * 0.045 + layer * short * 0.012,
        Math.sin(azimuth) * startR * 0.4,
      ),
      // drag 转线性阻尼：薄片的空气阻力很大。
      linearDamping: 1 - identity.drag,
      angularDamping: 0.12,
      allowSleep: false,
      collisionFilterMask: COLLIDE_WITH_NOTHING,
    });
    // 初始自旋：花瓣脱落时本来就在翻。
    body.angularVelocity.set(
      (((i * 31) % 100) / 100) * 3 - 1.5,
      (((i * 17) % 100) / 100) * 4 - 2,
      (((i * 23) % 100) / 100) * 3 - 1.5,
    );
    world.addBody(body);
    petals.push({ mesh, body, layer, azimuth });
  }

  /** 把所有刚体恢复到建时的确定初态，供每次 advance 从零重演。 */
  function resetBodies(): void {
    for (let i = 0; i < petals.length; i += 1) {
      const { body, layer, azimuth } = petals[i];
      const startR = short * (0.12 + layer * 0.035);
      body.position.set(
        Math.cos(azimuth) * startR,
        waterY + short * 0.045 + layer * short * 0.012,
        Math.sin(azimuth) * startR * 0.4,
      );
      body.velocity.setZero();
      body.quaternion.set(0, 0, 0, 1);
      body.angularVelocity.set(
        (((i * 31) % 100) / 100) * 3 - 1.5,
        (((i * 17) % 100) / 100) * 4 - 2,
        (((i * 23) % 100) / 100) * 3 - 1.5,
      );
    }
  }

  const force = new Vec3();

  return {
    group,
    petals,

    advance(t, openAt): void {
      // 物理时间由**场景进度**换算，不累加帧间隔：同一 t 必给同一帧。
      // 每次调用从确定初态重演到目标时刻——花瓣只在最后 400ms 活动，
      // 追赶步数有限（≤ MAX_CATCHUP），代价换来「状态是 t 的纯函数」。
      const target = Math.max(0, t) * LOTUS_DURATION_S;
      resetBodies();
      let elapsed = 0;
      let guard = 0;
      while (elapsed + FIXED_STEP <= target && guard < MAX_CATCHUP) {
        const sceneT = elapsed / LOTUS_DURATION_S;

        for (const { body, layer, azimuth } of petals) {
          const releaseAt = petalReleaseAt(layer);
          if (sceneT < releaseAt) {
            // 未脱落：跟着莲座，速度清零（这一步让「脱落」是真的脱落，
            // 而不是花瓣一开场就在飘）。
            body.velocity.setZero();
            continue;
          }
          // 时变场逐步采样：该层的开启度决定被推开的力度。
          const open = openAt(sceneT, layer);

          // ① 径向外推：花瓣开到极限后从花座上松脱，被余势推开。
          const px = body.position.x;
          const pz = body.position.z;
          const r = Math.hypot(px, pz) || 1e-6;
          const push = short * 0.42 * open;
          const targetX = (px / r) * push + Math.cos(azimuth) * short * 0.06;
          const targetZ = (pz / r) * push * 0.4;

          // ② 片状体升力：薄片下落时两面压差让它侧滑而非直落。
          // 力与水平速度正交（这是「飘」与「掉」的物理分界）。
          const vx = body.velocity.x;
          const vy = body.velocity.y;
          const lift = -vy * short * 0.0016 * identity.drag;
          const liftX = -Math.sign(vx || 1) * lift * 0.35;

          // ③ 水面托举：落到水面附近被表面张力托住，只在水平方向漂。
          const overWater = body.position.y - waterY;
          const buoyancy = overWater < 0
            ? -overWater * short * 0.9 - body.velocity.y * short * 0.02
            : 0;

          const k = 3.2 * body.mass;
          force.set(
            (targetX - vx) * k + liftX * body.mass,
            (lift + buoyancy) * body.mass,
            (targetZ - body.velocity.z) * k,
          );
          body.applyForce(force);
        }

        world.step(FIXED_STEP);
        elapsed += FIXED_STEP;
        guard += 1;
      }

      for (const { mesh, body, layer } of petals) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        mesh.quaternion.set(
          body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w,
        );
        // 未脱落的花瓣必须**同时**清零缩放：只清不透明度会把上一帧的
        // scale 留下，场景状态就变成「取决于怎么走到这个 t」。
        const released = t >= petalReleaseAt(layer);
        mesh.scale.setScalar(released ? 1 : 0);
      }
    },

    setOpacity(value): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of petals) world.removeBody(body);
    },
  };
}
