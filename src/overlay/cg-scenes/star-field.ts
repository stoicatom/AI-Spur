/**
 * 场景 14 star 的点状层：背景小星星、剥落星点、残星点。
 *
 * 与 star-parts 分开是因为这三层都是「一堆同构小点」，建法与主结构件
 * （SDF 星体、星轨贴片、环波）完全不同，且受 250 行上限约束。
 *
 * 命名前缀 `speck-` / `relic-` 与 star-parts 的 `ray-` / `tip-` / `grit-` /
 * `halo-` / `hoop-` 两两不互相包含，`^x-\d+$` 全形正则可精确区分。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { scaledCount } from '../cg-particle-kit';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { AXIS_COUNT } from './star-signature';

type DotMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

/** 一处需要随彩蛋整体换色的颜色：base 是原色，live 是被渲染读取的那个对象。 */
export type Tint = { readonly base: THREE.Color; readonly live: THREE.Color };

/** 互动① 从星轨顶端剥落的小星点。 */
export type StarSpeck = {
  readonly dot: DotMesh;
  /** 从哪条星轨顶端剥落。 */
  readonly axis: number;
  /** 剥落时刻（整幕归一化）。 */
  readonly bornAt: number;
  /** 剥落后的横向漂移方向与速率系数。 */
  readonly drift: number;
};

/** ⑧ 残星点：星体周围的拖尾星点。 */
export type StarRelic = {
  readonly dot: DotMesh;
  readonly angle: number;
  readonly radius: number;
  readonly phase: number;
};

/** 确定性伪随机：同一 index 永远得到同一值，验收才能复现。 */
export function jitter(index: number, salt: number): number {
  const v = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function makeDot(
  res: SceneResources, name: string, radius: number, color: THREE.Color, z: number,
): DotMesh {
  const mesh = res.mesh(name, new THREE.CircleGeometry(radius, 10), additiveMaterial(color, 0));
  mesh.position.z = z;
  res.group.add(mesh);
  return mesh;
}

/** ⑤ 小星星点缀：背景 instanced 闪烁。返回实例网格与它的确定性种子表。 */
export function buildTwinkleField(
  res: SceneResources, ctx: CgStageContext,
): { twinkle: THREE.InstancedMesh; twinkleSeeds: Float32Array } {
  const { width, height, quality } = ctx;
  const count = scaledCount(150, quality);
  const twinkle = new THREE.InstancedMesh(
    res.track(new THREE.CircleGeometry(Math.max(1.1, width * 0.0014), 6)),
    res.track(additiveMaterial('#E6EEFF', 0.85)),
    count,
  );
  twinkle.name = 'twinkle-field';
  twinkle.position.z = -40;
  twinkle.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  res.group.add(twinkle);

  // 每颗星三个数：x、y、闪烁相位。位置确定性，重开一次不会跳位。
  const twinkleSeeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    twinkleSeeds[i * 3] = (jitter(i, 1.7) - 0.5) * width * 1.05;
    twinkleSeeds[i * 3 + 1] = (jitter(i, 5.3) - 0.5) * height * 1.05;
    twinkleSeeds[i * 3 + 2] = jitter(i, 9.1) * Math.PI * 2;
  }
  return { twinkle, twinkleSeeds };
}

/** 把 seeds 写进实例矩阵；闪烁体现在各自的缩放上。 */
export function updateTwinkle(
  twinkle: THREE.InstancedMesh, seeds: Float32Array, seconds: number, level: number,
): void {
  const m = new THREE.Matrix4();
  for (let i = 0; i < twinkle.count; i += 1) {
    const blink = 0.45 + 0.55 * Math.abs(Math.sin(seconds * 1.9 + seeds[i * 3 + 2]));
    const s = Math.max(0.001, blink * level);
    m.makeScale(s, s, 1);
    m.setPosition(seeds[i * 3], seeds[i * 3 + 1], 0);
    twinkle.setMatrixAt(i, m);
  }
  twinkle.instanceMatrix.needsUpdate = true;
}

/**
 * 互动① 剥落小星点：每颗认领一条星轨，出生位置由那条轨的当前顶端决定。
 *
 * 剥落时刻贯穿第二幕——轨在长、顶端在走，星点因此沿轨排开而非同点堆叠。
 */
export function buildSpecks(
  res: SceneResources, ctx: CgStageContext, scale: number, tint: (c: THREE.Color) => THREE.Color,
  core: THREE.Color,
): StarSpeck[] {
  const count = scaledCount(24, ctx.quality);
  const specks: StarSpeck[] = [];
  for (let i = 0; i < count; i += 1) {
    const mesh = makeDot(res, `speck-${i}`, scale * 0.13, tint(core.clone()), 12);
    mesh.visible = false;
    specks.push({
      dot: mesh,
      axis: i % AXIS_COUNT,
      bornAt: 0.24 + (i / Math.max(1, count - 1)) * 0.42,
      drift: (jitter(i, 3.1) - 0.5) * 1.6,
    });
  }
  return specks;
}

/** ⑧ 残星点：环绕星体缓慢漂移的拖尾星点，末幕接管画面。 */
export function buildRelics(
  res: SceneResources, ctx: CgStageContext, scale: number, reach: number,
  tint: (c: THREE.Color) => THREE.Color, gold: THREE.Color,
): StarRelic[] {
  const count = scaledCount(18, ctx.quality);
  const relics: StarRelic[] = [];
  for (let i = 0; i < count; i += 1) {
    relics.push({
      dot: makeDot(res, `relic-${i}`, scale * 0.1, tint(gold.clone()), 8),
      angle: jitter(i, 2.3) * Math.PI * 2,
      radius: reach * (0.2 + jitter(i, 6.7) * 0.75),
      phase: jitter(i, 8.9) * Math.PI * 2,
    });
  }
  return relics;
}
