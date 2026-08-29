/**
 * 场景 41 fireworks 的元素搭建（规格 §4.2 场景 41 的九元素）。
 *
 * 与编排分离：本文件只把元素立起来，三幕动作在 cg-fireworks.ts。
 * 环境层（夜幕/倒影/光雾）在 ./fireworks-field-parts，
 * 三珠形态几何在 ./fireworks-pearls——都是被规格单列的关注点，各自成文件。
 *
 * 布局要点：本场景是全库唯一的**多落点**布局，三发烟花各有独立落点、
 * 独立升空窗口与独立起爆时刻，因此元素几乎都是「按发」成组建的。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { STAR_FIELD_FRAGMENT, createAdditivePlaneMaterial } from '../cg-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';
import { buildFireworksField, type FireworksField } from './fireworks-field-parts';
import { buildPearlLayers, type PearlForm, type PearlLayer } from './fireworks-pearls';

/**
 * 一发烟花的时间与落点档案。
 *
 * onset 依次错开：第一发落在第一幕结束点（450/1950≈0.231）之后，
 * 规格要求「先升空满一幕再起爆」；后两发各推迟 0.18，
 * 使全屏不同区域连续绽放而不是同时炸成一团。
 * riseSpan 是各发自己的升空窗口，终点即 onset——第二、三枚因此是「错时升空」。
 */
type UnitPlan = {
  /** 落点，屏宽/屏高的比例。 */
  x: number;
  y: number;
  /** 起爆时刻（归一化总进度）。 */
  onset: number;
  /** 爆开到熄灭的时长（归一化）。 */
  span: number;
  /** 升空窗口长度（归一化），终点对齐 onset。 */
  riseSpan: number;
  /** 主导形态：让三发各自读起来是不同的花。 */
  lead: PearlForm;
};

export const UNIT_PLANS: readonly UnitPlan[] = [
  { x: 0.02, y: 0.20, onset: 0.24, span: 0.50, riseSpan: 0.24, lead: 'peony' },
  { x: -0.31, y: 0.30, onset: 0.42, span: 0.46, riseSpan: 0.24, lead: 'lily' },
  { x: 0.32, y: 0.11, onset: 0.60, span: 0.40, riseSpan: 0.24, lead: 'starburst' },
];

/** 一发烟花：升空弹 → 爆珠核 → 形态珠 → 烟环 → 水面倒影，共用一条进度。 */
export type FireworkUnit = {
  plan: UnitPlan;
  /** 落点世界坐标（相对场景 group）。 */
  drop: THREE.Vector3;
  /** 升空起点 y，屏幕下缘之外。 */
  liftFrom: number;
  shell: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  trail: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  burst: THREE.Group;
  core: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  layers: PearlLayer[];
  reflection: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
};

/** 一颗残珠：滑落 + 被后续爆闪照亮。 */
export type Ember = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** 出生点（第一炸的珠壳上），相对场景 group。 */
  from: THREE.Vector3;
  fallSpeed: number;
  drift: number;
  phase: number;
};

export type FireworksParts = {
  res: SceneResources;
  field: FireworksField;
  units: FireworkUnit[];
  embers: Ember[];
  /** 残珠底色，每帧从它出发做照亮插值。 */
  emberBase: THREE.Color;
  /** 珠层半径（像素），也是爆珠核的尺度基准。 */
  burstRadius: number;
};

export function buildFireworksParts(ctx: CgStageContext): FireworksParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-fireworks');
  const short = Math.min(ctx.width, ctx.height);
  const burstRadius = short * 0.19;
  const liftFrom = -ctx.height * 0.58;

  // ⑦ 夜幕背景、⑧ 倒影底衬、⑨ 光雾：环境层交给 field parts，本文件专注「发」。
  const field = buildFireworksField(ctx, res, createAdditivePlaneMaterial, STAR_FIELD_FRAGMENT);

  // ① 升空弹：三枚共一个组，便于整体在爆开后一起退场。
  const riseGroup = new THREE.Group();
  riseGroup.name = 'rising-shell';
  riseGroup.position.z = 6;
  res.group.add(riseGroup);

  // ⑤ 连环弹：第二、三枚的爆点挂这里，与第一炸分组以对照规格元素划分。
  const chainGroup = new THREE.Group();
  chainGroup.name = 'chain-shells';
  res.group.add(chainGroup);

  // ③ 多层形态珠：所有形态层的公共父节点。
  const pearlRoot = new THREE.Group();
  pearlRoot.name = 'form-pearls';
  pearlRoot.position.z = 8;
  res.group.add(pearlRoot);

  // ⑥ 烟环：各发爆珠散尽后留下的烟圈。
  const smokeRoot = new THREE.Group();
  smokeRoot.name = 'smoke-ring';
  smokeRoot.position.z = 4;
  res.group.add(smokeRoot);

  const pearlGeometry = res.track(new THREE.SphereGeometry(Math.max(2, short * 0.007), 8, 6));
  const units: FireworkUnit[] = [];

  for (let u = 0; u < UNIT_PLANS.length; u += 1) {
    const plan = UNIT_PLANS[u];
    const drop = new THREE.Vector3(ctx.width * plan.x, ctx.height * plan.y, 0);

    const shell = res.mesh(
      `shell-${u}`,
      new THREE.SphereGeometry(Math.max(2.5, short * 0.009), 10, 8),
      additiveMaterial('#FFD9A8'),
    );
    shell.position.set(drop.x, liftFrom, 0);
    // 拖尾：锥体朝下贴在弹体后方，长度随上行速度拉伸。
    const trail = res.mesh(
      `shell-trail-${u}`,
      new THREE.ConeGeometry(Math.max(2, short * 0.008), short * 0.16, 8, 1, true),
      additiveMaterial(ctx.color.clone().lerp(new THREE.Color('#FFF0C4'), 0.4)),
    );
    trail.rotation.z = Math.PI;
    trail.position.set(drop.x, liftFrom, 0);
    riseGroup.add(shell, trail);

    // ② 第一炸单独具名：②与⑤在规格里是两个元素，节点划分保持一致。
    const burst = new THREE.Group();
    burst.name = u === 0 ? 'first-burst' : `chain-burst-${u}`;
    burst.position.copy(drop);
    burst.position.z = 10;
    (u === 0 ? res.group : chainGroup).add(burst);

    const core = res.mesh(
      `burst-core-${u}`,
      new THREE.CircleGeometry(burstRadius * 0.42, 40),
      additiveMaterial('#FFF6E0'),
    );
    burst.add(core);

    const ringMaterial = additiveMaterial(ctx.color.clone().lerp(new THREE.Color('#FFFFFF'), 0.2));
    // 烟圈是薄壳，正交视角下背面也要出图，否则半圈会凭空消失。
    ringMaterial.side = THREE.DoubleSide;
    const ring = res.mesh(
      `smoke-ring-${u}`,
      new THREE.TorusGeometry(burstRadius * 0.78, burstRadius * 0.055, 6, 48),
      ringMaterial,
    );
    ring.position.copy(drop);
    smokeRoot.add(ring);

    const layers = buildPearlLayers(
      res, pearlRoot, u, plan.lead, drop, burstRadius, pearlGeometry, ctx.color, ctx.quality,
    );

    // ⑧ 倒影：水面上的一团柔光，亮度与本发爆珠同源，因此是真反射不是独立动画。
    const reflection = res.mesh(
      `reflection-${u}`,
      new THREE.CircleGeometry(burstRadius * 0.9, 32),
      additiveMaterial(ctx.color.clone().lerp(new THREE.Color('#FFE2B0'), 0.35)),
    );
    reflection.position.set(drop.x, -ctx.height * 0.34, 0);
    // 横向拉宽、纵向压扁：水面反光被波纹摊开，不能是个正圆。
    reflection.scale.set(1.15, 0.34, 1);
    field.water.add(reflection);

    units.push({ plan, drop, liftFrom, shell, trail, burst, core, ring, layers, reflection });
  }

  // ④ 残珠雨：从各发的珠壳上剥落，逐颗独立材质以便被后续爆闪单独照亮。
  const emberRoot = new THREE.Group();
  emberRoot.name = 'ember-rain';
  emberRoot.position.z = 7;
  res.group.add(emberRoot);

  const emberGeometry = res.track(new THREE.SphereGeometry(Math.max(1.4, short * 0.0045), 6, 5));
  const emberBase = ctx.color.clone().lerp(new THREE.Color('#FFB067'), 0.4);
  const emberCount = scaledCount(64, ctx.quality);
  const embers: Ember[] = [];
  for (let i = 0; i < emberCount; i += 1) {
    const material = res.track(additiveMaterial(emberBase.clone()));
    const mesh = new THREE.Mesh(emberGeometry, material);
    mesh.name = `ember-${i}`;
    const host = units[i % units.length];
    const angle = (i / emberCount) * Math.PI * 2 + (i % 5) * 0.44;
    const spread = burstRadius * (0.55 + (((i * 41) % 100) / 100) * 0.7);
    const from = new THREE.Vector3(
      host.drop.x + Math.cos(angle) * spread,
      host.drop.y + Math.sin(angle) * spread * 0.8,
      0,
    );
    mesh.position.copy(from);
    emberRoot.add(mesh);
    embers.push({
      mesh,
      material,
      from,
      fallSpeed: ctx.height * (0.42 + (((i * 17) % 100) / 100) * 0.5),
      drift: (i % 2 === 0 ? 1 : -1) * ctx.width * (0.02 + ((i % 7) / 100)),
      phase: (i % 11) * 0.31,
    });
  }

  return { res, field, units, embers, emberBase, burstRadius };
}
