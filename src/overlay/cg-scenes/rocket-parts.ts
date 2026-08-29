/**
 * 场景 01 rocket 的元素搭建（规格 §4.2 场景 01 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-rocket.ts，
 * 碎屑刚体在 rocket-debris.ts。拆分理由是 CLAUDE.md 的 250 行上限，
 * 也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { HORIZON_FRAGMENT, SMOKE_COLUMN_FRAGMENT } from './rocket-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** 尾焰锥主色：蓝核。规格要求「蓝核+白边双层」。 */
const CORE_COLOR = '#7FC4FF';
/** 焰边主色：白边。 */
const EDGE_COLOR = '#EAF4FF';

export type SmokeColumn = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** 静止时的柱心 x（局部坐标），被音爆环推开时以此为基准外移。 */
  restX: number;
  /** 推开方向（±1）。 */
  side: number;
};

export type RocketParts = {
  res: SceneResources;
  /** 发射参考尺度（像素），各元素尺寸以它为基准。 */
  scale: number;
  /** 台面高度（局部坐标），碎屑刚体地面与之共用。 */
  padY: number;
  /** ① 引擎主焰：外层白边锥。 */
  flame: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  /** ① 引擎主焰：内层蓝核锥。 */
  flameCore: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>;
  /** 焰锥全长（像素），换算 scale 与锥底位置都用它。 */
  flameLength: number;
  /** ② 尾烟两侧。 */
  columns: SmokeColumn[];
  /** ② 烟层容器，测试按 exhaust-smoke 点名量下半屏覆盖。 */
  smokeGroup: THREE.Group;
  /** ③ 发射台：平台 + 4 根立柱。 */
  platform: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  pillars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>[];
  /** ④ 音爆双环。 */
  rings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[];
  /** 环外半径（R+tube），把目标半径换算成 scale。 */
  ringOuter: number;
  /** ⑥ 地平线光带。 */
  horizon: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑦ 背景星点阵。 */
  stars: THREE.InstancedMesh;
  /** ⑧ 二级点火亮斑。 */
  ignition: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
};

/** 建一根尾焰锥：尖端朝下（喷口在上、焰向下喷）。 */
function flameCone(
  res: SceneResources,
  name: string,
  radius: number,
  length: number,
  color: string,
): THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial> {
  const cone = res.mesh(name, new THREE.ConeGeometry(radius, length, 22, 1, true), additiveMaterial(color, 0));
  // ConeGeometry 默认尖端朝 +y，转 180° 让尖端朝下：焰锥自喷口向下张开。
  cone.rotation.z = Math.PI;
  return cone;
}

export function buildRocketParts(ctx: CgStageContext): RocketParts {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-rocket');
  const { width, height, quality } = ctx;
  const short = Math.min(width, height);
  const scale = short * 0.2;
  const padY = -height * 0.42;

  // ⑦ 背景星点阵：深夜发射场的底层，最先建保证叠在最后面。
  const starCount = scaledCount(120, quality);
  const stars = new THREE.InstancedMesh(
    res.track(new THREE.SphereGeometry(Math.max(1.2, width * 0.0016), 6, 6)),
    res.track(additiveMaterial('#DCE8FF', 0.9)),
    starCount,
  );
  stars.name = 'star-field';
  stars.position.z = -40;
  res.group.add(stars);

  // ⑥ 地平线光带：横贯全屏的晨曦线，压在台面高度附近。
  const horizon = res.mesh(
    'horizon-band',
    new THREE.PlaneGeometry(width * 1.3, height * 0.3),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#2E5C8A') },
        uDawn: { value: new THREE.Color('#FFC98A') },
        uGlow: { value: 0 },
        uTime: { value: 0 },
      },
      fragmentShader: HORIZON_FRAGMENT,
    }),
  );
  horizon.position.set(0, padY + height * 0.02, -30);
  res.group.add(horizon);

  // ② 尾烟两侧：两根独立柱，各占下半屏一侧，合起来铺满屏宽。
  const smokeGroup = new THREE.Group();
  smokeGroup.name = 'exhaust-smoke';
  smokeGroup.position.z = -12;
  res.group.add(smokeGroup);

  const columnWidth = width * 0.62;
  const columnHeight = height * 0.72;
  const columns: SmokeColumn[] = [0, 1].map((i) => {
    const side = i === 0 ? -1 : 1;
    const restX = side * width * 0.17;
    const mesh = res.mesh(
      `smoke-column-${i}`,
      new THREE.PlaneGeometry(columnWidth, columnHeight),
      createBlendedPlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#5A5F66') },
          uTime: { value: 0 },
          uDensity: { value: 0 },
          uRise: { value: 0 },
          uCap: { value: 0 },
        },
        fragmentShader: SMOKE_COLUMN_FRAGMENT,
      }),
    );
    // 柱底压到屏幕下缘外，柱身占据下半屏。
    mesh.position.set(restX, -height * 0.5 + columnHeight * 0.42, 0);
    smokeGroup.add(mesh);
    return { mesh, restX, side };
  });

  // ③ 发射台：平台 + 4 根立柱，位于台面高度，第二幕闪白消隐。
  const padGroup = new THREE.Group();
  padGroup.name = 'launch-pad';
  padGroup.position.z = 8;
  res.group.add(padGroup);

  const padMaterial = () => {
    const material = additiveMaterial('#9FB4C8', 1);
    // 结构件是实体金属，叠加混合会让它在暗背景上糊成一团光。
    material.blending = THREE.NormalBlending;
    return material;
  };
  const platform = res.mesh(
    'pad-platform',
    new THREE.BoxGeometry(scale * 2.4, scale * 0.16, scale * 0.5),
    padMaterial(),
  );
  platform.position.y = padY;
  padGroup.add(platform);

  const pillarHeight = scale * 1.5;
  const pillars = [0, 1, 2, 3].map((i) => {
    const pillar = res.mesh(
      `pad-pillar-${i}`,
      new THREE.BoxGeometry(scale * 0.11, pillarHeight, scale * 0.11),
      padMaterial(),
    );
    // 四柱分列两侧、前后错开深度，构成可读的桁架而非一排栅栏。
    pillar.position.set(
      (i % 2 === 0 ? -1 : 1) * scale * (i < 2 ? 0.95 : 1.5),
      padY + pillarHeight * 0.5,
      i < 2 ? scale * 0.18 : -scale * 0.18,
    );
    padGroup.add(pillar);
    return pillar;
  });

  // ① 引擎主焰：白边包蓝核的双层锥，锥底朝下贯穿中轴线。
  const flameLength = height * 0.92;
  const flame = flameCone(res, 'engine-flame', scale * 0.34, flameLength, EDGE_COLOR);
  flame.position.z = 4;
  res.group.add(flame);
  const flameCore = flameCone(res, 'engine-flame-core', scale * 0.19, flameLength * 0.82, CORE_COLOR);
  flameCore.position.z = 6;
  res.group.add(flameCore);

  // ④ 音爆双环：锥底起跳，依次扩散。
  const ringR = scale * 0.5;
  const ringTube = scale * 0.06;
  const ringMaterial = () => {
    const material = additiveMaterial('#CFE6FF', 0);
    material.side = THREE.DoubleSide;
    return material;
  };
  const rings = [0, 1].map((i) => {
    const ring = res.mesh(
      `sonic-ring-${i}`,
      new THREE.TorusGeometry(ringR, ringTube, 8, 84),
      ringMaterial(),
    );
    ring.position.z = 14 + i;
    ring.scale.setScalar(0.001);
    res.group.add(ring);
    return ring;
  });
  // 环组容器供测试按元素名点数；环本身直挂 group 以免容器缩放叠加。
  const ringAnchor = new THREE.Group();
  ringAnchor.name = 'sonic-ring';
  res.group.add(ringAnchor);

  // ⑧ 二级点火亮斑：喷口处的脉冲亮点，第三幕主角。
  const ignition = res.mesh(
    'stage-ignition',
    new THREE.SphereGeometry(scale * 0.2, 16, 12),
    additiveMaterial('#FFF2D0', 0),
  );
  ignition.position.z = 18;
  res.group.add(ignition);

  return {
    res, scale, padY, flame, flameCore, flameLength,
    columns, smokeGroup, platform, pillars,
    rings, ringOuter: ringR + ringTube,
    horizon, stars, ignition,
  };
}
