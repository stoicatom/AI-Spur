/**
 * 场景 02 phoenix 的元素搭建（规格 §4.2 场景 02 的八元素）。
 *
 * 与编排分离：本文件只负责「把元素立起来」，三幕动作在 cg-phoenix.ts。
 * 拆分理由是 CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { CLOUD_RIFT_FRAGMENT, HEAT_HAZE_FRAGMENT, NIRVANA_PILLAR_FRAGMENT } from './phoenix-shaders';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import { scaledCount } from '../cg-particle-kit';

/** 翼羽片数（单侧，电影级）。 */
const WING_FEATHERS = 9;

export type WingFeather = {
  /** 右翼片与其镜像左翼片，同一套参数生成，成对更新保证对称。 */
  right: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  left: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** 该片在翼形轨迹上的归一化位置（0 翼根 → 1 翼尖）。 */
  k: number;
};

export type GoldFeather = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** 起始横向位置。 */
  x: number;
  /**
   * 起始高度：沿屏高铺开一整屏。
   *
   * 只靠时间 delay 错开会让金雨挤成一条横带——所有羽共用同一条下落曲线，
   * 同一时刻的落差只有 delay 那点差异。纵向直接铺开才谈得上「覆盖全屏」。
   */
  startY: number;
  /** 下落起点相位，让金雨不是齐刷刷一排。 */
  delay: number;
  spin: number;
};

export type PhoenixParts = {
  res: SceneResources;
  /** ① 双翼火羽的容器（测试按 wing-plume 点名）。 */
  wingPlume: THREE.Group;
  feathers: WingFeather[];
  /** ② 凤凰躯干（低多边形发光 mesh）。 */
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** ③ 头顶火焰冠。 */
  crown: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** ④ 金羽雨容器与羽片。 */
  rain: THREE.Group;
  goldFeathers: GoldFeather[];
  /** ⑤ 涅槃光柱。 */
  pillar: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑥ 热浪扭曲层（屏幕空间折射）。 */
  haze: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑦ 云层撕裂。 */
  cloud: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  /** ⑧ 冲击羽环形波（双层）。 */
  rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  /** 翼展半宽（世界单位），编排层按它算翼尖位置。 */
  wingSpan: number;
};

/**
 * 翼形轨迹取点（纯函数，签名「对称双翼」的唯一几何来源）。
 *
 * 左右翼共用这一个函数，`side` 只做 x 取反，因此对称性是函数的性质，
 * 不依赖调用方分别摆两套坐标——测试可以直接对它断言。
 *
 * @param k 翼根 → 翼尖的归一化位置
 * @param side 右翼 +1 / 左翼 -1
 * @param span 翼展半宽（世界单位）
 */
export function wingPoint(k: number, side: 1 | -1, span: number): { x: number; y: number } {
  const c = Math.min(1, Math.max(0, k));
  // 横向靠 sin 的前四分之一：翼根附近铺得快，接近翼尖趋缓，像展开的翼骨。
  const x = Math.sin(c * Math.PI * 0.5) * span * side;
  // 纵向先抬后落：中段是翼峰，翼尖略垂——猛禽展翅的经典弧线。
  const y = (Math.sin(c * Math.PI) * 0.42 - c * c * 0.3) * span * 0.5;
  return { x, y };
}

/** 羽片几何：一枚窄长菱形，尖端朝外。 */
function featherGeometry(length: number, width: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, length * 0.35, 0, length);
  shape.quadraticCurveTo(-width, length * 0.35, 0, 0);
  return new THREE.ShapeGeometry(shape, 6);
}

export function buildPhoenixParts(ctx: CgStageContext): PhoenixParts {
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-phoenix');
  const { width, height, color, quality } = ctx;
  const ember = new THREE.Color('#FFC24A');
  const litColor = new THREE.Color('#FFE7B0');
  // 翼展横贯 2/3 屏宽：半宽取 0.37，双翼合计 0.74 屏宽，留出裕量给羽片长度。
  const wingSpan = width * 0.37;

  // ⑦ 云层撕裂：铺在最后，凤凰在云前盘旋。
  const cloud = res.mesh(
    'cloud-rift',
    new THREE.PlaneGeometry(width * 1.3, height * 1.15),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#2A2438') },
        uLitColor: { value: litColor.clone() },
        uTime: { value: 0 },
        uDensity: { value: 0 },
        uRift: { value: 0 },
        uLit: { value: 0 },
      },
      fragmentShader: CLOUD_RIFT_FRAGMENT,
    }),
  );
  cloud.position.z = -30;
  res.group.add(cloud);

  // ⑤ 涅槃光柱：自下而上，贯穿全屏高度。
  const pillar = res.mesh(
    'nirvana-pillar',
    new THREE.PlaneGeometry(width * 0.34, height * 1.2),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: litColor.clone() },
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      fragmentShader: NIRVANA_PILLAR_FRAGMENT,
    }),
  );
  pillar.position.z = -20;
  res.group.add(pillar);

  // ① 双翼火羽：左右成对，同一套 k 参数镜像生成。
  const wingPlume = new THREE.Group();
  wingPlume.name = 'wing-plume';
  res.group.add(wingPlume);

  const featherLength = wingSpan * 0.4;
  const feathers: WingFeather[] = [];
  for (let i = 0; i < WING_FEATHERS; i += 1) {
    const k = (i + 1) / WING_FEATHERS;
    const length = featherLength * (0.55 + k * 0.65);
    // 左右两片必须是两份独立几何：共用同一个 geometry 会让镜像缩放互相干扰。
    const make = (tag: 'r' | 'l') =>
      res.mesh(
        `wing-feather-${tag}-${i}`,
        featherGeometry(length, length * 0.16),
        additiveMaterial(i > WING_FEATHERS * 0.6 ? ember : color, 0),
      );
    const right = make('r');
    const left = make('l');
    wingPlume.add(right, left);
    feathers.push({ right, left, k });
  }

  // ② 凤凰躯干：低多边形，锥体拉长当胸腹，发光材质。
  const body = res.mesh(
    'phoenix-body',
    new THREE.ConeGeometry(wingSpan * 0.09, wingSpan * 0.52, 5),
    additiveMaterial(ember, 0),
  );
  res.group.add(body);

  // ③ 头顶火焰冠：躯干顶端一小簇，运行期高频抖动。
  const crown = res.mesh(
    'flame-crown',
    new THREE.ConeGeometry(wingSpan * 0.05, wingSpan * 0.17, 4),
    additiveMaterial(litColor, 0),
  );
  res.group.add(crown);

  // ⑥ 热浪扭曲层：整屏覆盖，折射纹按热源位置衰减。
  const haze = res.mesh(
    'heat-haze',
    new THREE.PlaneGeometry(width, height),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#FFB066') },
        uTime: { value: 0 },
        uRefract: { value: 0 },
        uCenterY: { value: 0.5 },
      },
      fragmentShader: HEAT_HAZE_FRAGMENT,
    }),
  );
  haze.position.z = 20;
  res.group.add(haze);

  // ④ 金羽雨：覆盖全屏，档位控制片数。
  const rain = new THREE.Group();
  rain.name = 'golden-feather-rain';
  res.group.add(rain);

  const rainCount = scaledCount(30, quality);
  const goldFeathers: GoldFeather[] = [];
  for (let i = 0; i < rainCount; i += 1) {
    // 横向铺满屏宽、纵向铺满屏高：金雨要覆盖全屏（规格全屏要求）。
    const x = (i / Math.max(1, rainCount - 1) - 0.5) * width * 0.98;
    // 交错取高度而非顺序排布，避免出现「左低右高」的斜带。
    const startY = (((i * 7) % rainCount) / Math.max(1, rainCount - 1) - 0.5) * height * 0.92;
    const size = width * 0.012 * (0.7 + ((i * 37) % 11) / 11);
    const mesh = res.mesh(
      `gold-feather-${i}`,
      featherGeometry(size * 2.6, size * 0.5),
      additiveMaterial(i % 3 === 0 ? litColor : ember, 0),
    );
    mesh.position.set(x, startY, 0);
    rain.add(mesh);
    goldFeathers.push({
      mesh,
      x,
      startY,
      delay: ((i * 53) % 17) / 17 * 0.32,
      spin: 1 + ((i * 29) % 13) / 13 * 2.4,
    });
  }

  // ⑧ 冲击羽环形波：双层，外环薄内环厚，扩张速度不同。
  const ringRadius = Math.min(width, height) * 0.5;
  const rings = [0, 1].map((i) =>
    res.mesh(
      `shock-ring-${i}`,
      new THREE.RingGeometry(ringRadius * (i ? 0.9 : 0.82), ringRadius * (i ? 0.95 : 0.94), 96),
      additiveMaterial(i ? litColor : ember, 0),
    ),
  );
  const ringGroup = new THREE.Group();
  ringGroup.name = 'shock-plume-ring';
  ringGroup.add(...rings);
  res.group.add(ringGroup);

  return {
    res, wingPlume, feathers, body, crown,
    rain, goldFeathers, pillar, haze, cloud, rings, wingSpan,
  };
}
