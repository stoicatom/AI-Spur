/**
 * 场景 41 fireworks 的「三珠形态」几何（规格 §4.2 场景 41 独立签名）。
 *
 * 单独成文件的理由：百合/牡丹/星芒是本场景唯一无法从其它场景推导的部分，
 * 规格把它列为全库唯一签名，因此它值得一个能被单独读懂、单独验收的模块；
 * 混进 parts 里会被落点、升空、残珠那些「按发」的搭建逻辑淹没。
 */
import * as THREE from 'three';
import type { EffectQuality } from '../../shared/config';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** 三种珠形态。 */
export type PearlForm = 'lily' | 'peony' | 'starburst';
export const PEARL_FORMS: readonly PearlForm[] = ['lily', 'peony', 'starburst'];

/** 一层形态珠：整层同生同灭，动作施加在 group 上。 */
export type PearlLayer = {
  form: PearlForm;
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  /** 该形态在本发中的权重，主导形态最大。 */
  weight: number;
};

/**
 * 三形态的珠位分布——签名的几何实现。
 *
 * 形态差异做在**位置**而不是只有颜色：百合下垂、牡丹等长球壳、星芒长短相间，
 * 这样静帧也能分辨花型，验收也能用垂直重心与半径离散度量出来。
 */
export function pearlOffset(form: PearlForm, i: number, count: number, radius: number): THREE.Vector3 {
  if (form === 'peony') {
    // 黄金角铺点 + 3% 抖动：完美等距的圆看起来像贴图，留一点不齐才像真花。
    const golden = i * 2.399963;
    const r = radius * (0.97 + ((i * 29) % 7) / 100);
    return new THREE.Vector3(Math.cos(golden) * r, Math.sin(golden) * r, 0);
  }
  const a = (i / count) * Math.PI * 2;
  if (form === 'starburst') {
    // 长短相间的尖刺：半径离散度就是星芒的识别特征。
    const spike = i % 2 === 0 ? 1.38 : 0.52;
    return new THREE.Vector3(Math.cos(a) * radius * spike, Math.sin(a) * radius * spike, 0);
  }
  // 百合：伞状下垂，整层重心明显低于落点。
  const droop = radius * 0.62;
  return new THREE.Vector3(Math.cos(a) * radius * 0.86, Math.sin(a) * radius * 0.5 - droop, 0);
}

/** 形态色：三种花型各自偏色，同屏才有「百花齐放」的层次。 */
export function formColor(form: PearlForm, base: THREE.Color): THREE.Color {
  if (form === 'peony') return base.clone().lerp(new THREE.Color('#FFE9A8'), 0.45);
  if (form === 'starburst') return base.clone().lerp(new THREE.Color('#9FE8FF'), 0.5);
  return base.clone().lerp(new THREE.Color('#FF7ACF'), 0.4);
}

/**
 * 建一发烟花的三层形态珠。
 *
 * 珠数按档位缩放；非主导层设 3 颗下限，因为低于 3 颗就读不出花型了——
 * 低档要的是「更稀疏」，不是把两种陪衬形态退化成散点。
 */
export function buildPearlLayers(
  res: SceneResources,
  parent: THREE.Group,
  unit: number,
  lead: PearlForm,
  drop: THREE.Vector3,
  radius: number,
  geometry: THREE.BufferGeometry,
  baseColor: THREE.Color,
  quality: EffectQuality,
): PearlLayer[] {
  const leadCount = scaledCount(15, quality);
  const layers: PearlLayer[] = [];

  for (const form of PEARL_FORMS) {
    const isLead = form === lead;
    const group = new THREE.Group();
    group.name = `pearl-${form}-${unit}`;
    group.position.copy(drop);
    parent.add(group);

    const material = res.track(additiveMaterial(formColor(form, baseColor)));
    const count = isLead ? leadCount : Math.max(3, Math.round(leadCount * 0.6));
    for (let i = 0; i < count; i += 1) {
      const pearl = new THREE.Mesh(geometry, material);
      pearl.name = `pearl-${form}-${unit}-${i}`;
      pearl.position.copy(pearlOffset(form, i, count, radius));
      group.add(pearl);
    }
    layers.push({ form, group, material, weight: isLead ? 1 : 0.55 });
  }
  return layers;
}
