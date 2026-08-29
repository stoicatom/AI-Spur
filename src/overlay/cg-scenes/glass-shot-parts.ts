/**
 * 场景 35 glass-shot 的元素搭建（规格 §4.2 场景 35 的九元素）。
 *
 * 与编排分离：本文件只把元素立起来并备好刚体世界，
 * 三幕动作在 cg-glass-shot.ts。拆分理由是 CLAUDE.md 的 250 行上限。
 */
import * as THREE from 'three';
import type { World } from 'cannon-es';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { scaledCount } from '../cg-particle-kit';
import { GLASS_CRACK_FRAGMENT, GLASS_PANE_FRAGMENT, TRACER_HEAT_FRAGMENT } from './glass-shot-shaders';
import { buildShatterLayers, type Shard } from './glass-shot-shatter';

/** 规格「16 条主裂纹」是形态定义，不随档位缩减。 */
export const RADIAL_CRACKS = 16;

export type GlassShotParts = {
  res: SceneResources;
  /** 冲击点（相对 group 原点）。 */
  impact: THREE.Vector2;
  /** 裂纹层的半跨（像素），归一化半径乘它得到像素半径。 */
  span: number;
  tracer: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  tracerHeat: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  paneMaterial: THREE.ShaderMaterial;
  bloom: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  webMaterial: THREE.ShaderMaterial;
  radials: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
  rings: Array<THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>;
  stress: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
  shards: Shard[];
  glints: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>;
  exitLine: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  grit: Array<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>;
  world: World;
  /** 地面 y（相对 group），碎片落到此停住。 */
  floorY: number;
};

/** 伪随机：同一 i 每次构建结果一致，碎裂形态因此可重现。 */
function rand(i: number, salt: number): number {
  return ((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1 + 1) % 1;
}

export function buildGlassShotParts(ctx: CgStageContext): GlassShotParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-glass-shot');
  const span = Math.max(ctx.width, ctx.height) * 0.62;
  const floorY = -ctx.height * 0.46;
  // 冲击点略偏上：子弹从侧下方飞入，命中偏心才有弹道方向感。
  const impact = new THREE.Vector2(-ctx.width * 0.06, ctx.height * 0.09);

  // ② 玻璃板：严格覆盖全屏，是本场景「全屏介质被击碎」签名的载体。
  const paneMaterial = res.track(createBlendedPlaneMaterial({
    uniforms: {
      uTint: { value: ctx.color.clone() },
      uShatter: { value: 0 },
      uSheen: { value: 1 },
    },
    fragmentShader: GLASS_PANE_FRAGMENT,
  }));
  const pane = res.mesh('glass-pane', new THREE.PlaneGeometry(ctx.width, ctx.height), paneMaterial);
  pane.position.z = -4;
  res.group.add(pane);

  // ① 子弹曳光：锥体弹头 + 热浪拖尾，第一幕沿弹道推进。
  const tracerGroup = new THREE.Group();
  tracerGroup.name = 'bullet-tracer';
  tracerGroup.position.z = 24;
  res.group.add(tracerGroup);

  const tracer = res.mesh(
    'tracer-core',
    new THREE.ConeGeometry(Math.max(2, span * 0.012), span * 0.075, 10),
    additiveMaterial('#FFF4D6', 1),
  );
  tracer.rotation.z = -Math.PI / 2;
  const tracerHeat = res.mesh(
    'tracer-heat',
    new THREE.PlaneGeometry(span * 0.5, span * 0.05),
    res.track(createAdditivePlaneMaterial({
      uniforms: { uColor: { value: new THREE.Color('#FFD79A') }, uProgress: { value: 0 }, uIntensity: { value: 0 } },
      fragmentShader: TRACER_HEAT_FRAGMENT,
    })),
  );
  tracerGroup.add(tracer, tracerHeat);

  // ⑧ 弹道贯穿线：子弹穿出屏外的余留路径。
  const exitLine = res.mesh(
    'exit-trajectory',
    new THREE.PlaneGeometry(Math.max(ctx.width, ctx.height) * 1.6, Math.max(2, span * 0.006)),
    additiveMaterial('#EAF6FF'),
  );
  exitLine.position.set(impact.x, impact.y, 20);
  res.group.add(exitLine);

  // ③ 白斑炸点：命中瞬间的白斑，只在幕二起头闪一下。
  const bloom = res.mesh(
    'impact-bloom',
    new THREE.CircleGeometry(span * 0.16, 40),
    additiveMaterial('#FFFFFF'),
  );
  bloom.position.set(impact.x, impact.y, 18);
  res.group.add(bloom);

  const cracks = buildCrackLayers(res, ctx, impact, span);
  const shatter = buildShatterLayers(res, ctx, impact, span, floorY);

  return {
    res, impact, span, tracer, tracerHeat, paneMaterial, bloom,
    exitLine, floorY, ...cracks, ...shatter,
  };
}

type CrackLayers = Pick<GlassShotParts, 'webMaterial' | 'radials' | 'rings' | 'stress'>;

/** ④⑤ 裂纹与孔洞拉丝：细纹交给 shader，主裂纹用实体条以便逐条按前沿推进。 */
function buildCrackLayers(
  res: SceneResources,
  ctx: CgStageContext,
  impact: THREE.Vector2,
  span: number,
): CrackLayers {
  const webMaterial = res.track(createAdditivePlaneMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#DCF2FF') },
      uRadialCount: { value: RADIAL_CRACKS },
      uRingCount: { value: ctx.quality === 'cinematic' ? 6 : ctx.quality === 'high' ? 5 : 4 },
      uFront: { value: 0 },
      uHole: { value: 0 },
      uFine: { value: 0 },
    },
    fragmentShader: GLASS_CRACK_FRAGMENT,
  }));
  const web = res.mesh('web-cracks', new THREE.PlaneGeometry(span * 2, span * 2), webMaterial);
  web.position.set(impact.x, impact.y, 6);
  res.group.add(web);

  // 16 条主裂纹各自成节点：脱落判定要按单条前沿走，合成一张贴图就没法逐条控。
  const radials: CrackLayers['radials'] = [];
  for (let i = 0; i < RADIAL_CRACKS; i += 1) {
    const angle = (i / RADIAL_CRACKS) * Math.PI * 2 + (rand(i, 2) - 0.5) * 0.22;
    const length = span * (0.72 + rand(i, 9) * 0.5);
    const mesh = res.mesh(
      `crack-radial-${i}`,
      new THREE.PlaneGeometry(length, Math.max(1.4, span * 0.0055 * (1 + rand(i, 4) * 0.8))),
      additiveMaterial('#E8F7FF'),
    );
    // 以冲击点为轴心外伸：绕点旋转后沿自身方向平移半个长度。
    mesh.position.set(impact.x + Math.cos(angle) * length * 0.5, impact.y + Math.sin(angle) * length * 0.5, 8);
    mesh.rotation.z = angle;
    res.group.add(mesh);
    radials.push(mesh);
  }

  const ringCount = ctx.quality === 'low' ? 3 : 5;
  const rings: CrackLayers['rings'] = [];
  for (let i = 0; i < ringCount; i += 1) {
    const radius = span * (0.16 + i * 0.16 + rand(i, 11) * 0.05);
    const mesh = res.mesh(
      `crack-ring-${i}`,
      new THREE.RingGeometry(radius, radius + Math.max(1.2, span * 0.004), 64, 1, 0, Math.PI * 2 * (0.55 + rand(i, 13) * 0.4)),
      additiveMaterial('#D6EEFF'),
    );
    mesh.position.set(impact.x, impact.y, 8);
    mesh.rotation.z = rand(i, 17) * Math.PI * 2;
    res.group.add(mesh);
    rings.push(mesh);
  }

  // ⑤ 孔洞拉丝：短应力纹向孔口聚拢，与主裂纹反向（内收而非外伸）。
  const stress: CrackLayers['stress'] = [];
  const stressCount = scaledCount(14, ctx.quality);
  for (let i = 0; i < stressCount; i += 1) {
    const angle = rand(i, 21) * Math.PI * 2;
    const length = span * (0.07 + rand(i, 23) * 0.06);
    const mesh = res.mesh(
      `hole-stress-${i}`,
      new THREE.PlaneGeometry(length, Math.max(1, span * 0.003)),
      additiveMaterial('#FFFFFF'),
    );
    mesh.position.set(impact.x + Math.cos(angle) * length * 0.8, impact.y + Math.sin(angle) * length * 0.8, 10);
    mesh.rotation.z = angle;
    res.group.add(mesh);
    stress.push(mesh);
  }
  const holeAnchor = new THREE.Group();
  holeAnchor.name = 'hole-stress';
  holeAnchor.position.set(impact.x, impact.y, 10);
  res.group.add(holeAnchor);

  return { webMaterial, radials, rings, stress };
}
