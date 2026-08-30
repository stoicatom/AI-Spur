/**
 * 场景 25 shield 的 ⑦ 地面震尘：cannon-es 刚体被撞击震起。
 *
 * 起跳冲量读 `normalLoad`——**被盾吃下的那一份动能**（法向分量），
 * 而不是入射总动能。这是签名接到本元素的因果链：正撞盾心时震尘最猛，
 * 擦盾缘时动能几乎全被弹走、地面几乎不震。把冲量写成常量就等于把
 * 「格挡反弹」退化成「挡住并照样把地面震一遍」。
 *
 * 物理步长固定 1/60 且由**场景进度**驱动（不是 frameDelta）：验收会以
 * 任意稀疏的 t 调 update，按调用频率推进会让缺陷只在稀疏采样下暴露
 * （本项目 ice/meteor/wind 都踩过这个坑）。
 */
import * as THREE from 'three';
import { Body, NaiveBroadphase, Plane, Sphere, Vec3, World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import {
  IMPACT_AT,
  SHIELD_DURATION_S,
} from './shield-deflect';

/** 物理步长固定 1/60：确定性步进。 */
const FIXED_STEP = 1 / 60;
/** 单帧最多追赶的物理步数。 */
const MAX_CATCHUP = 240;

export type DustMote = {
  readonly mesh: THREE.Mesh;
  readonly body: Body;
  /** 到撞击点正下方的水平距离（像素）：越近震得越高。 */
  readonly distance: number;
};

export interface DustField {
  readonly group: THREE.Group;
  readonly motes: readonly DustMote[];
  /** 是否已施加起跳冲量——验收用来确认「撞击才震」而非一开始就在跳。 */
  readonly kicked: boolean;
  /**
   * 按场景进度推进。
   *
   * @param t 整幕归一化进度
   * @param load 盾面吃下的动能占比（`normalLoad` 的值）
   */
  advance(t: number, load: number): void;
  setOpacity(value: number): void;
  dispose(): void;
}

/**
 * 建立震尘场。
 *
 * @param res 场景资源容器
 * @param ctx 场景上下文，quality 决定刚体数量
 * @param short 画面短边（像素）
 * @param groundY 地面高度（局部坐标）
 * @param hitX 撞击点的水平位置（局部坐标）：震源在它正下方
 */
export function createDustField(
  res: SceneResources,
  ctx: CgStageContext,
  short: number,
  groundY: number,
  hitX: number,
): DustField {
  const identity = MATERIAL_IDENTITIES.shield.physical;
  const group = new THREE.Group();
  group.name = 'dust-field';
  res.group.add(group);
  // 嵌套容器由工具层的递归清理负责，此处无需自己登记回收。

  const world = new World({
    gravity: new Vec3(0, -short * 2.6 * (1 + identity.gravity), 0),
    broadphase: new NaiveBroadphase(),
    allowSleep: false,
  });

  // 地面：尘粒落回后停住，不穿下去。
  const floor = new Body({ mass: 0, shape: new Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  floor.position.set(0, groundY, 0);
  world.addBody(floor);

  const radius = Math.max(1.4, short * 0.005);
  const geometry = res.track(new THREE.SphereGeometry(radius, 6, 5));
  const material = res.track(additiveMaterial('#C6B49A'));
  material.opacity = 0;

  const count = scaledCount(30, ctx.quality);
  const motes: DustMote[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    // 前缀 `dustgrain-` 与场景其它节点（`wavearc-N` / `sparkanchor-N`）互不包含。
    mesh.name = `dustgrain-${i}`;
    group.add(mesh);

    // 沿地面铺开，以震源为中心向两侧分布。
    const spread = (i / Math.max(1, count - 1) - 0.5) * short * 1.5;
    const x = hitX + spread;
    const body = new Body({
      mass: identity.mass,
      shape: new Sphere(radius),
      position: new Vec3(x, groundY + radius, ((i % 7) - 3) * short * 0.01),
      linearDamping: 1 - identity.drag,
      allowSleep: false,
    });
    world.addBody(body);
    motes.push({ mesh, body, distance: Math.abs(spread) });
  }

  let physicsElapsed = 0;
  let kicked = false;
  const reach = short * 0.75;

  return {
    group,
    motes,
    get kicked() { return kicked; },

    advance(t, load): void {
      if (t < IMPACT_AT) return;

      // 撞击那一刻给一次冲量：强度 = 盾吃下的动能 × 距震源的衰减。
      if (!kicked) {
        kicked = true;
        for (const { body, distance } of motes) {
          const falloff = Math.max(0, 1 - distance / reach);
          const up = short * 1.5 * load * falloff;
          if (up <= 0) continue;
          body.velocity.set(
            // 横向也被推开一点：震波沿地面传，不是纯竖直弹起。
            (body.position.x - hitX) * 0.9,
            up,
            0,
          );
        }
      }

      // 物理时间由场景进度驱动，与 update 调用频率无关。
      const target = (t - IMPACT_AT) * SHIELD_DURATION_S;
      let guard = 0;
      while (physicsElapsed + FIXED_STEP <= target && guard < MAX_CATCHUP) {
        world.step(FIXED_STEP);
        physicsElapsed += FIXED_STEP;
        guard += 1;
      }

      for (const { mesh, body } of motes) {
        mesh.position.set(body.position.x, body.position.y, body.position.z);
      }
    },

    setOpacity(value): void {
      material.opacity = value;
    },

    dispose(): void {
      for (const { body } of motes) world.removeBody(body);
      world.removeBody(floor);
    },
  };
}
