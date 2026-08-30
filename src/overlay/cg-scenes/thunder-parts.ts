/**
 * 场景 11 thunder 的元素搭建（规格 §4.2 场景 11 的八元素）。
 *
 * 与编排分离：本文件只把元素立起来，三幕动作在 cg-thunder.ts，
 * 纯数学在 thunder-shock.ts，刚体在 thunder-rubble.ts。拆分理由是
 * CLAUDE.md 的 250 行上限，也让元素清单能一眼对照规格。
 *
 * 命名规则：不同性质的前缀**互不包含**。环层 `shock-ring-N`、回响
 * `echo-wave-N`、雾带 `mist-band-N`、山脊 `ridge-N`、扬尘锚点
 * `dust-anchor-N`、碎石刚体 `rock-N`（在 thunder-rubble）。没有任何一个
 * 前缀是另一个的前缀——本项目出过 `shard-` 同时命中刚体与反光片的事故。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { additiveMaterial, createSceneResources, type SceneResources } from '../cg-scene-kit';
import {
  VOLUME_CLOUD_FRAGMENT,
  createAdditivePlaneMaterial,
  createBlendedPlaneMaterial,
} from '../cg-shaders';
import { scaledCount } from '../cg-particle-kit';
import {
  CONDENSE_MIST_FRAGMENT,
  GROUND_CRACK_FRAGMENT,
  RIDGE_FRAGMENT,
  SHOCK_RING_FRAGMENT,
  VALLEY_ECHO_FRAGMENT,
} from './thunder-shaders';
import { SHOCK_LAYERS, THUNDER_GROUND_FLATTEN, groundYFor, shockReach } from './thunder-shock';

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type BasicMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

/** 回响尾迹层数：谷两壁各回一支。 */ export const ECHO_WAVES = 2;
/** 冷凝雾带层数：波后凝出的两条，宽窄不同。 */ export const MIST_BANDS = 2;
/** 远山剪影层数：近中远三层，视差不同。 */ export const RIDGE_LAYERS = 3;

export type ShockLayer = { readonly mesh: ShaderMesh; readonly index: number };

export type DustAnchor = {
  /**
   * 场景自持的具名锚点，用于验收「扬尘跟着环波走」。
   *
   * quarks 的 `system.emitter` 一旦 BatchedRenderer 跑过 update 就被摘出
   * 场景树，按名字定位不到——所以扬尘发射位置由这个锚点镜像：编排层每帧
   * 同时写锚点与 emitter，验收量锚点。
   */
  readonly node: THREE.Object3D;
  /** 该锚点在环上的方位角（弧度），四向铺开。 */
  readonly angle: number;
};

/** 规格八元素的运行时句柄（④碎石在 thunder-rubble，⑤扬尘由 quarks 承载）。 */
export type ThunderParts = {
  readonly res: SceneResources;
  /** ① 地裂雷光。 */ readonly crack: ShaderMesh;
  /** ② 环形冲击波（多层）。 */ readonly rings: ShockLayer[];
  /** ③ 山谷回响尾迹。 */ readonly echoes: ShaderMesh[];
  /** ⑤ 扬尘的具名锚点，供验收定位发射点。 */ readonly dustAnchors: DustAnchor[];
  /** ⑥ 远山剪影。 */ readonly ridges: ShaderMesh[];
  /** ⑦ 天空暗闪：云幕 + 整屏频闪片。 */
  readonly skyCloud: ShaderMesh;
  readonly strobe: BasicMesh;
  /** ⑧ 空气冷凝纹。 */ readonly mists: ShaderMesh[];
  /** 地面线（局部 y）。 */ readonly groundY: number;
  /** 环贴片半宽（像素）：像素半径 → shader UV 半径的换算基准。 */
  readonly ringHalfSpan: number;
  /** 屏心到最远缘的距离（像素）。 */ readonly reach: number;
  readonly scale: number;
};

/**
 * 把一个平面压扁贴到地面上。
 *
 * 贴地写在 scale.y 上而不是只在 shader 里做，是为了让「这圈波是躺着的」
 * 成为场景树里可量的几何事实（验收测 scale.y < scale.x * 0.5）。
 */
function flattenGround(mesh: THREE.Object3D, groundY: number, z: number): void {
  mesh.scale.set(1, THUNDER_GROUND_FLATTEN, 1);
  mesh.position.set(0, groundY, z);
  mesh.renderOrder = 2;
}

export function buildThunderParts(ctx: CgStageContext): ThunderParts {
  const { width, height, color, quality } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-thunder');
  const short = Math.min(width, height);
  const scale = short * 0.05;
  const groundY = groundYFor(height);
  const reach = shockReach(width, height);

  // 雷光偏冷白蓝，山体压成暗青灰：山谷夜里的一记闷雷。
  const bolt = color.clone().lerp(new THREE.Color('#DCE9FF'), 0.72);
  const ember = color.clone().lerp(new THREE.Color('#8FB4FF'), 0.5);
  const rockTone = new THREE.Color('#151B26');

  // ⑦ 天空暗闪（下层）：压顶云幕，频闪从云内透出。
  const skyCloud = res.mesh(
    'sky-cloud',
    new THREE.PlaneGeometry(width * 1.3, height * 0.66),
    createBlendedPlaneMaterial({
      uniforms: {
        uColor: { value: new THREE.Color('#171C2B') },
        uFlashColor: { value: bolt },
        uTime: { value: 0 },
        uDensity: { value: 0 },
        uFlash: { value: 0 },
      },
      fragmentShader: VOLUME_CLOUD_FRAGMENT,
    }),
  );
  skyCloud.position.set(0, height * 0.28, -40);
  res.group.add(skyCloud);

  // ⑥ 远山剪影：三层视差，越远越淡越矮。
  const ridges: ShaderMesh[] = [];
  for (let i = 0; i < RIDGE_LAYERS; i += 1) {
    const depth = i / (RIDGE_LAYERS - 1);
    const layerH = height * (0.46 - depth * 0.12);
    const mesh = res.mesh(
      `ridge-${i}`,
      new THREE.PlaneGeometry(width * (1.35 + depth * 0.2), layerH),
      createBlendedPlaneMaterial({
        uniforms: {
          uColor: { value: rockTone.clone().lerp(new THREE.Color('#2C3648'), depth * 0.7) },
          uRimColor: { value: bolt },
          uAlpha: { value: 0 },
          uRim: { value: 0 },
          uSeed: { value: 1 + i * 2.7 },
        },
        fragmentShader: RIDGE_FRAGMENT,
      }),
    );
    // 山脚落在地面线上，山体往上长。
    mesh.position.set(0, groundY + layerH * 0.5, -30 + i * 4);
    res.group.add(mesh);
    ridges.push(mesh);
  }

  // ③ 山谷回响尾迹：贴地，与主环反向回传。
  const echoSpan = reach * 2.6;
  const echoes: ShaderMesh[] = [];
  for (let i = 0; i < ECHO_WAVES; i += 1) {
    const mesh = res.mesh(
      `echo-wave-${i}`,
      new THREE.PlaneGeometry(echoSpan, echoSpan),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: ember },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uRipples: { value: 26 + i * 11 },
        },
        fragmentShader: VALLEY_ECHO_FRAGMENT,
      }),
    );
    flattenGround(mesh, groundY, -10 + i);
    res.group.add(mesh);
    echoes.push(mesh);
  }

  // ⑧ 空气冷凝纹：贴地雾带，跟在波后。
  const mists: ShaderMesh[] = [];
  for (let i = 0; i < MIST_BANDS; i += 1) {
    const mesh = res.mesh(
      `mist-band-${i}`,
      new THREE.PlaneGeometry(echoSpan, echoSpan),
      createBlendedPlaneMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#B9CBDD') },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uWidth: { value: 0.05 + i * 0.045 },
          uTime: { value: 0 },
        },
        fragmentShader: CONDENSE_MIST_FRAGMENT,
      }),
    );
    flattenGround(mesh, groundY, -6 + i);
    res.group.add(mesh);
    mists.push(mesh);
  }

  // ② 环形冲击波：多层贴地环，贴片半宽即像素→UV 的换算基准。
  const ringSpan = reach * 2.9;
  const rings: ShockLayer[] = [];
  for (let i = 0; i < SHOCK_LAYERS; i += 1) {
    const mesh = res.mesh(
      `shock-ring-${i}`,
      new THREE.PlaneGeometry(ringSpan, ringSpan),
      createAdditivePlaneMaterial({
        uniforms: {
          uColor: { value: i === 0 ? bolt : ember },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uThickness: { value: 0.02 + i * 0.008 },
        },
        fragmentShader: SHOCK_RING_FRAGMENT,
      }),
    );
    flattenGround(mesh, groundY, 6 + i);
    res.group.add(mesh);
    rings.push({ mesh, index: i });
  }

  // ① 地裂雷光：横贯地面线的一条带，从震中往两侧撕开。
  const crack = res.mesh(
    'ground-crack',
    new THREE.PlaneGeometry(width * 1.3, height * 0.2),
    createAdditivePlaneMaterial({
      uniforms: {
        uColor: { value: ember },
        uGlowColor: { value: bolt },
        uAlpha: { value: 0 },
        uReveal: { value: 0 },
        uFlicker: { value: 0 },
      },
      fragmentShader: GROUND_CRACK_FRAGMENT,
    }),
  );
  crack.position.set(0, groundY, 14);
  res.group.add(crack);

  // ⑦ 天空暗闪（上层）：整屏频闪片。
  const strobe = res.mesh(
    'sky-strobe',
    new THREE.PlaneGeometry(width * 1.4, height * 1.4),
    additiveMaterial(bolt, 0),
  );
  strobe.position.z = 30;
  res.group.add(strobe);

  // ⑤ 扬尘锚点：沿环四向铺开，档位只减数量不移除元素（至少留 1）。
  const anchorCount = scaledCount(6, quality);
  const dustAnchors: DustAnchor[] = [];
  for (let i = 0; i < anchorCount; i += 1) {
    const node = new THREE.Object3D();
    node.name = `dust-anchor-${i}`;
    res.group.add(node);
    dustAnchors.push({ node, angle: (i / anchorCount) * Math.PI * 2 });
  }

  return {
    res, crack, rings, echoes, dustAnchors, ridges, skyCloud, strobe, mists,
    groundY, ringHalfSpan: ringSpan * 0.5, reach, scale,
  };
}
