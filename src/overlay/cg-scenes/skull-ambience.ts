/**
 * 场景 08 skull 的氛围层：⑤ 磷火飘浮 与 ⑧ 墓碑剪影。
 *
 * 这两者都是「一批重复小物件铺开成场」，与头骨主体的搭建关注点不同，
 * 且合起来会把 skull-parts.ts 顶过 250 行上限，故独立成文件。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';

/** ⑤ 一粒磷火：上升小火焰，各自相位错开。 */
export type PhosphorMote = {
  mesh: THREE.Mesh;
  /** 横向基准位置。 */
  x: number;
  /** 初始上升相位（0→1），保证任一时刻高低都有。 */
  phase: number;
  /** 上升速率倍率。 */
  rate: number;
  /** 横向摆动频率。 */
  sway: number;
};

export type PhosphorField = {
  group: THREE.Group;
  motes: PhosphorMote[];
  /** 上升区间高度（像素），规格要求「飘满半屏」。 */
  span: number;
  /** 整层透明度。全体共用一份材质，故由构建方回传句柄而非从 children 反查。 */
  setOpacity(value: number): void;
};

/**
 * ⑧ 墓碑剪影：背景暗 mesh，高低错落分布在冢地两侧。
 *
 * @param groundY 地面高度，碑底坐在其上
 */
export type TombstoneRow = {
  group: THREE.Group;
  /** 整排剪影透明度，同样由构建方回传强类型句柄。 */
  setOpacity(value: number): void;
};

export function buildTombstones(
  res: SceneResources,
  ctx: CgStageContext,
  groundY: number,
): TombstoneRow {
  const group = new THREE.Group();
  group.name = 'tombstone-silhouette';
  group.position.z = -30;
  res.group.add(group);

  // 剪影用不透明暗色（非叠加）：叠加混合会让「暗」变成「亮」，剪影就没了。
  const material = res.track(new THREE.MeshBasicMaterial({
    color: 0x121a1f, transparent: true, opacity: 0, depthWrite: false,
  }));

  const slots = [-0.41, -0.26, -0.13, 0.15, 0.29, 0.44];
  for (let i = 0; i < slots.length; i += 1) {
    const w = ctx.width * (0.035 + (((i * 31) % 7) / 7) * 0.022);
    const h = ctx.height * (0.12 + (((i * 47) % 9) / 9) * 0.13);
    const stone = new THREE.Mesh(res.track(new THREE.BoxGeometry(w, h, 1)), material);
    stone.name = `tombstone-${i}`;
    // 底边坐在地面上，碑才不像浮在空中。
    stone.position.set(ctx.width * slots[i], groundY + h * 0.5, 0);
    // 微倾：荒冢的碑不会笔直。
    stone.rotation.z = ((((i * 23) % 11) / 11) - 0.5) * 0.14;
    group.add(stone);
  }
  return { group, setOpacity: (value) => { material.opacity = value; } };
}

/**
 * ⑤ 磷火飘浮：贴地起飞的小火苗，横向铺满、纵向占半屏。
 *
 * @param color 磷火色（与鬼火同色，磷火是鬼火散开后的余绪）
 * @param scale 火苗尺度参考（像素）
 */
export function buildPhosphorField(
  res: SceneResources,
  ctx: CgStageContext,
  color: string,
  scale: number,
  groundY: number,
): PhosphorField {
  const group = new THREE.Group();
  group.name = 'phosphor-drift';
  group.position.z = 20;
  res.group.add(group);

  const geometry = res.track(new THREE.PlaneGeometry(scale * 0.075, scale * 0.11));
  const material = res.track(additiveMaterial(color));
  const count = scaledCount(90, ctx.quality);
  const motes: PhosphorMote[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `phosphor-mote-${i}`;
    // 哈希散布而非等距：等距会显出可见的列阵。
    const x = ((((i * 67) % 197) / 197) - 0.5) * ctx.width * 0.96;
    mesh.position.set(x, groundY, 0);
    group.add(mesh);
    motes.push({
      mesh,
      x,
      phase: ((i * 43) % 100) / 100,
      rate: 0.65 + (((i * 59) % 100) / 100) * 0.8,
      sway: 0.6 + (((i * 31) % 100) / 100) * 2.4,
    });
  }
  return {
    group,
    motes,
    span: ctx.height * 0.58,
    setOpacity: (value) => { material.opacity = value; },
  };
}
