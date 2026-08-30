/**
 * 场景 21 bell 的元素搭建。
 *
 * 命名规则：不同性质的节点前缀**互不包含**（真实事故：`shard-` 同时
 * 命中刚体与反光片，断言测错对象却照样绿）。这里用
 * `oring-N`（泛音光环）/ `airwave-N`（空气波纹）/ `ghost-N`（钟舌残影），
 * 三者互不为前缀；驻波层单独具名 `bell-standing-wave`，
 * 不带 `-N` 后缀，因此不会被 `/^x-\d+$/` 类正则误收。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  BELL_AIR_RIPPLE_FRAGMENT,
  BELL_BODY_FRAGMENT,
  BELL_PARTIAL_RING_FRAGMENT,
  BELL_STANDING_WAVE_FRAGMENT,
  BELL_TEMPLE_FRAGMENT,
  PARTIAL_SLOTS,
} from './bell-shaders';
import { BELL_PARTIALS } from './bell-partials';

/** 空气波纹环数：透明同心环分三层错峰推出。 */
export const AIR_RIPPLE_LAYERS = 3;
/** 钟舌残影帧数：撞击后留在空中的一串淡影。 */
export const CLAPPER_GHOSTS = 4;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type DiscMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

export type BellRing = {
  readonly mesh: ShaderMesh;
  /** 对应的分音序号：环的颜色、粗细、扩散速度都由该分音决定。 */
  readonly partial: number;
};

export type BellParts = {
  readonly res: SceneResources;
  /** ⑧ 背景庙宇剪影 */
  readonly temple: ShaderMesh;
  /** ① 钟身 */
  readonly body: ShaderMesh;
  /** ③ 钟波（钟面驻波） */
  readonly standing: ShaderMesh;
  /** ④ 泛音光环：每个分音一层 */
  readonly rings: BellRing[];
  /** ⑥ 空气波纹 */
  readonly ripples: ShaderMesh[];
  /** ② 撞球 */
  readonly striker: DiscMesh;
  /** ⑦ 钟舌残影 */
  readonly ghosts: DiscMesh[];
  /**
   * ⑤ 余韵拖尾的具名锚点。
   *
   * quarks 的 `system.emitter` 一旦 `hub.update()` 跑过就被批渲染器摘走，
   * 无法按节点名定位；因此场景自持一个具名 Object3D 镜像发射点，
   * 「余韵拖尾跟着钟口走」才可验收。
   */
  readonly echoAnchor: THREE.Object3D;
  /** 钟口中心（局部坐标）与钟体尺寸（像素）。 */
  readonly mouth: THREE.Vector2;
  readonly bellW: number;
  readonly bellH: number;
  /** 撞球飞入的起点与撞击点（局部坐标）。 */
  readonly strikeFrom: THREE.Vector2;
  readonly strikeTo: THREE.Vector2;
  readonly scale: number;
};

/** 各分音光环的色相：基频偏暖金、高分音偏冷青（规格要求「多环不同色」）。 */
function ringColor(base: THREE.Color, index: number): THREE.Color {
  const warm = new THREE.Color('#FFD48A');
  const cool = new THREE.Color('#8FE8FF');
  const k = index / Math.max(1, BELL_PARTIALS.length - 1);
  return base.clone().lerp(warm.clone().lerp(cool, k), 0.78);
}

/** 建 bell 场景的全部元素。 */
export function buildBellParts(ctx: CgStageContext): BellParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'bell-scene');
  const short = Math.min(width, height);
  const scale = short * 0.05;

  const bronze = color.clone().lerp(new THREE.Color('#A9791F'), 0.7);
  const patina = color.clone().lerp(new THREE.Color('#2E7A62'), 0.72);
  const hot = color.clone().lerp(new THREE.Color('#FFF2C8'), 0.8);
  const night = new THREE.Color('#0B1020');
  const silhouette = new THREE.Color('#050810');

  const bellH = height * 0.46;
  const bellW = bellH * 0.86;
  // 钟口在钟体下缘（shader 里 uv.y=0 即钟口）。
  const mouth = new THREE.Vector2(0, -bellH * 0.5);

  // ⑧ 背景庙宇剪影：最远景，铺满全屏。
  const temple = res.mesh(
    'temple-silhouette',
    new THREE.PlaneGeometry(width * 1.6, height * 1.6),
    createBlendedPlaneMaterial({
      fragmentShader: BELL_TEMPLE_FRAGMENT,
      uniforms: {
        uColor: { value: silhouette },
        uSky: { value: night },
        uAlpha: { value: 0 },
        uGlow: { value: 0 },
      },
    }),
  );
  temple.position.z = -40;
  res.group.add(temple);

  // ⑥ 空气波纹：透明同心环，在泛音环之后（更远）。
  const ripples: ShaderMesh[] = [];
  for (let i = 0; i < AIR_RIPPLE_LAYERS; i += 1) {
    const mesh = res.mesh(
      `airwave-${i}`,
      new THREE.PlaneGeometry(width * 1.5, height * 1.5),
      createBlendedPlaneMaterial({
        fragmentShader: BELL_AIR_RIPPLE_FRAGMENT,
        uniforms: {
          uColor: { value: new THREE.Color('#CFE6FF') },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          uSpacing: { value: 0.035 + i * 0.012 },
          uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
        },
      }),
    );
    mesh.position.z = -24 + i;
    res.group.add(mesh);
    ripples.push(mesh);
  }

  // ④ 泛音光环：每个分音一层，颜色与粗细各异。
  const rings: BellRing[] = [];
  for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
    const mesh = res.mesh(
      `oring-${i}`,
      new THREE.PlaneGeometry(width * 1.5, height * 1.5),
      createAdditivePlaneMaterial({
        fragmentShader: BELL_PARTIAL_RING_FRAGMENT,
        uniforms: {
          uColor: { value: ringColor(color, i) },
          uAlpha: { value: 0 },
          uRadius: { value: 0 },
          // 高分音的环更细（波长更短）。
          uThickness: { value: 0.05 / BELL_PARTIALS[i].ratio },
          uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
        },
      }),
    );
    mesh.position.z = -14 + i;
    res.group.add(mesh);
    rings.push({ mesh, partial: i });
  }

  // ① 钟身
  const body = res.mesh(
    'bell-body',
    new THREE.PlaneGeometry(bellW, bellH),
    createBlendedPlaneMaterial({
      fragmentShader: BELL_BODY_FRAGMENT,
      uniforms: {
        uColor: { value: bronze },
        uPatina: { value: patina },
        uAlpha: { value: 0 },
        uRing: { value: 0 },
      },
    }),
  );
  body.position.z = 0;
  res.group.add(body);

  // ③ 钟波：贴在钟身之上，共用同一轮廓函数所以严格不出界。
  const standing = res.mesh(
    'bell-standing-wave',
    new THREE.PlaneGeometry(bellW, bellH),
    createAdditivePlaneMaterial({
      fragmentShader: BELL_STANDING_WAVE_FRAGMENT,
      uniforms: {
        uColor: { value: bronze.clone().lerp(hot, 0.4) },
        uHot: { value: hot },
        uAlpha: { value: 0 },
        uAmp: { value: new Array<number>(PARTIAL_SLOTS).fill(0) },
        uMode: { value: BELL_PARTIALS.map((p) => p.mode) },
        uPhase: { value: new Array<number>(PARTIAL_SLOTS).fill(0) },
        uFront: { value: 0 },
      },
    }),
  );
  standing.position.z = 4;
  res.group.add(standing);

  // ⑦ 钟舌残影：撞击轨迹上的一串淡影，撞球之后渲染。
  const strikeFrom = new THREE.Vector2(-bellW * 1.5, -bellH * 0.14);
  const strikeTo = new THREE.Vector2(-bellW * 0.42, -bellH * 0.14);
  const ghosts: DiscMesh[] = [];
  for (let i = 0; i < CLAPPER_GHOSTS; i += 1) {
    const geometry = res.track(new THREE.CircleGeometry(scale * 0.3, 16));
    const material = res.track(new THREE.MeshBasicMaterial({
      color: hot,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    const ghost = new THREE.Mesh(geometry, material);
    ghost.name = `ghost-${i}`;
    ghost.position.z = 6;
    res.group.add(ghost);
    ghosts.push(ghost);
  }

  // ② 撞球
  const strikerGeometry = res.track(new THREE.CircleGeometry(scale * 0.36, 24));
  const strikerMaterial = res.track(new THREE.MeshBasicMaterial({
    color: bronze.clone().lerp(hot, 0.3),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
  }));
  const striker = new THREE.Mesh(strikerGeometry, strikerMaterial);
  striker.name = 'striker-ball';
  striker.position.z = 10;
  res.group.add(striker);

  // ⑤ 余韵拖尾的具名锚点（见类型注释：quarks emitter 不可按名定位）。
  const echoAnchor = new THREE.Object3D();
  echoAnchor.name = 'echo-trail-anchor';
  echoAnchor.position.set(mouth.x, mouth.y, 8);
  res.group.add(echoAnchor);

  return {
    res, temple, body, standing, rings, ripples, striker, ghosts, echoAnchor,
    mouth, bellW, bellH, strikeFrom, strikeTo, scale,
  };
}
