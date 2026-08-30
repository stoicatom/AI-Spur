/**
 * 场景 16 sun 的元素搭建。
 *
 * 只负责建出规格 §4.2 场景 16 的 8 个构成件并具名，
 * 时间轴编排在 cg-sun.ts。命名规则：不同性质的节点前缀互不包含
 * （`prom-N` 日珥 / `corona-N` 日冕 / `spot-N` 光斑），避免
 * 前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import { SUN_CORE_FRAGMENT, SUN_CORONA_FRAGMENT, SUN_HAZE_FRAGMENT } from './sun-shaders';

/** 日冕圈带层数：三层不同半径，脉动相位错开。 */
const CORONA_BANDS = 3;
/** 日珥条数：沿日缘不同方位卷起。 */
const PROMINENCE_COUNT = 5;
/** 光斑数量：日面上慢移的亮点。 */
const SPOT_COUNT = 6;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

export type SunProminence = {
  readonly mesh: BasicMesh;
  /** 根部所在的日缘方位角（弧度）。 */
  readonly angle: number;
  /** 卷曲方向：+1 顺时针、-1 逆时针，相邻日珥交替。 */
  readonly curl: number;
  /** 喷发时刻偏移（0–1 幕内），让 5 条错峰。 */
  readonly at: number;
  /** 弧长（像素）。 */
  readonly span: number;
};

export type SunSpot = {
  readonly mesh: BasicMesh;
  /** 在日面上的极坐标（半径比例、初始角）。 */
  readonly rr: number;
  readonly angle0: number;
  /** 漂移角速度（rad/s），各不相同。 */
  readonly omega: number;
};

export type SunParts = {
  readonly res: SceneResources;
  readonly core: ShaderMesh;
  readonly coronas: ShaderMesh[];
  readonly proms: SunProminence[];
  readonly spots: SunSpot[];
  readonly haze: ShaderMesh;
  readonly pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  readonly uv: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** 日核半径（像素）。 */
  readonly coreRadius: number;
};

/**
 * 日珥几何：一条从日缘伸出并卷回的弧带。
 *
 * 用 TubeGeometry 沿三次贝塞尔走：起点在日缘，控制点往外推并侧偏，
 * 终点落回日缘附近，形成真实日珥的「拱桥」形态。
 */
function prominenceGeometry(radius: number, span: number, curl: number, thickness: number): THREE.TubeGeometry {
  const out = radius * 1.02;
  const reach = span;
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(out, 0, 0),
    new THREE.Vector3(out + reach * 0.45, reach * 0.55 * curl, 0),
    new THREE.Vector3(out + reach * 0.72, -reach * 0.28 * curl, 0),
    new THREE.Vector3(out + reach * 0.18, -reach * 0.62 * curl, 0),
  );
  return new THREE.TubeGeometry(curve, 28, thickness, 6, false);
}

/** 建 sun 场景的全部元素。 */
export function buildSunParts(ctx: CgStageContext): SunParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'sun-scene');
  const short = Math.min(width, height);
  const coreRadius = short * 0.2;

  // 日色：素材色往橙金推，与 moon 的银白冷色形成昼夜对照。
  const warm = color.clone().lerp(new THREE.Color('#FF9C2E'), 0.66);
  const hot = color.clone().lerp(new THREE.Color('#FFF3C4'), 0.78);
  const violet = color.clone().lerp(new THREE.Color('#9B8CFF'), 0.55);

  // ① 日核
  const core = res.mesh(
    'sun-core',
    new THREE.PlaneGeometry(coreRadius * 2, coreRadius * 2),
    createBlendedPlaneMaterial({
      fragmentShader: SUN_CORE_FRAGMENT,
      uniforms: {
        uColor: { value: warm },
        uHotColor: { value: hot },
        uTime: { value: 0 },
        uChurn: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  res.group.add(core);

  // ③ 日冕：三层辉光圈带，半径递增。
  const coronas: ShaderMesh[] = [];
  for (let i = 0; i < CORONA_BANDS; i += 1) {
    const size = coreRadius * (3.6 + i * 1.5);
    const mesh = res.mesh(
      `corona-${i}`,
      new THREE.PlaneGeometry(size, size),
      createAdditivePlaneMaterial({
        fragmentShader: SUN_CORONA_FRAGMENT,
        uniforms: {
          uColor: { value: i === CORONA_BANDS - 1 ? violet : warm },
          uTime: { value: 0 },
          uAlpha: { value: 0 },
          uRadius: { value: 0.28 + i * 0.05 },
          uAsym: { value: 0.4 + i * 0.2 },
        },
      }),
    );
    res.group.add(mesh);
    coronas.push(mesh);
  }

  // ② 日珥：沿日缘 5 个方位，卷曲方向交替。
  const proms: SunProminence[] = [];
  for (let i = 0; i < PROMINENCE_COUNT; i += 1) {
    const angle = (i / PROMINENCE_COUNT) * Math.PI * 2 + 0.35;
    const curl = i % 2 === 0 ? 1 : -1;
    const span = coreRadius * (0.72 + (i % 3) * 0.2);
    const geometry = prominenceGeometry(coreRadius, span, curl, Math.max(2, coreRadius * 0.035));
    const material = new THREE.MeshBasicMaterial({
      color: hot,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `prom-${i}`;
    mesh.rotation.z = angle;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    proms.push({ mesh: mesh as unknown as BasicMesh, angle, curl, at: i * 0.0825, span });
  }

  // ④ 光斑漂移：日面上的亮点，各自角速度不同。
  const spots: SunSpot[] = [];
  for (let i = 0; i < SPOT_COUNT; i += 1) {
    const size = coreRadius * (0.07 + (i % 3) * 0.026);
    const geometry = new THREE.CircleGeometry(size, 18);
    const material = new THREE.MeshBasicMaterial({
      color: hot,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `spot-${i}`;
    res.track(geometry);
    res.track(material);
    res.group.add(mesh);
    spots.push({
      mesh: mesh as unknown as BasicMesh,
      rr: 0.26 + (i % 4) * 0.16,
      angle0: i * 1.31,
      omega: 0.28 + (i % 3) * 0.17,
    });
  }

  // ⑤ 热浪：贴在日核下方的上升颤动带。
  const haze = res.mesh(
    'sun-haze',
    new THREE.PlaneGeometry(width * 1.1, height * 0.55),
    createAdditivePlaneMaterial({
      fragmentShader: SUN_HAZE_FRAGMENT,
      uniforms: {
        uColor: { value: warm },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
      },
    }),
  );
  haze.position.y = -height * 0.2;
  res.group.add(haze);

  // ⑥ 日辉脉冲环
  const pulseRadius = coreRadius * 2.5;
  const pulseGeometry = new THREE.RingGeometry(pulseRadius * 0.9, pulseRadius, 128);
  const pulseMaterial = new THREE.MeshBasicMaterial({
    color: hot,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
  pulse.name = 'sun-pulse-ring';
  res.track(pulseGeometry);
  res.track(pulseMaterial);
  res.group.add(pulse);

  // ⑦ 紫外线光晕：冷色外圈，与暖色日冕对冲出色温层次。
  const uvRadius = coreRadius * 4.6;
  const uvGeometry = new THREE.RingGeometry(uvRadius * 0.82, uvRadius, 128);
  const uvMaterial = new THREE.MeshBasicMaterial({
    color: violet,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const uv = new THREE.Mesh(uvGeometry, uvMaterial);
  uv.name = 'sun-uv-halo';
  res.track(uvGeometry);
  res.track(uvMaterial);
  res.group.add(uv);

  return { res, core, coronas, proms, spots, haze, pulse, uv, coreRadius };
}
