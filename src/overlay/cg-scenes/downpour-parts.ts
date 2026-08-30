/**
 * 场景 32 downpour 的元素搭建（shader 层与静态 mesh）。
 *
 * 命名规则：不同性质的节点前缀互不包含（`ripple-N` 涟漪 /
 * `splash-N` 溅点白雾 / `rain-curtain` 雨帘），避免前缀匹配的断言测错对象。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { createSceneResources, type SceneResources } from '../cg-scene-kit';
import { createAdditivePlaneMaterial, createBlendedPlaneMaterial } from '../cg-shaders';
import {
  DOWNPOUR_GROUNDFOG_FRAGMENT,
  DOWNPOUR_HAZE_FRAGMENT,
  DOWNPOUR_PUDDLE_FRAGMENT,
} from './downpour-shaders';

/** 溅点白雾团数（②地面雨舞的雾侧）。 */
export const SPLASH_PUFF_COUNT = 12;

type ShaderMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
type PuffMesh = THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;

export type SplashPuff = {
  readonly mesh: PuffMesh;
  /** 该团的横向位置与起始相位。 */
  readonly x: number;
  readonly phase: number;
};

export type DownpourParts = {
  readonly res: SceneResources;
  /** ④雨幕深浅（远层大气透视）。 */
  readonly haze: ShaderMesh;
  /** ⑥积水反光。 */
  readonly puddle: ShaderMesh;
  /** ⑧雾气沿地。 */
  readonly groundFog: ShaderMesh;
  /** ⑤闪电间隙亮光（全屏弱闪幕）。 */
  readonly flashVeil: ShaderMesh;
  /** ②地面雨舞的白雾团。 */
  readonly puffs: SplashPuff[];
  readonly short: number;
  /** 地面带的上下沿（局部 y）。 */
  readonly groundTop: number;
  readonly groundBottom: number;
};

/** 建 downpour 的 shader 层与静态 mesh（雨帘/涟漪各在专属模块）。 */
export function buildDownpourParts(ctx: CgStageContext): DownpourParts {
  const { width, height, color } = ctx;
  const res = createSceneResources(ctx.root, ctx.origin, 'downpour-scene');
  const short = Math.min(width, height);
  const groundBottom = -height * 0.5;
  const groundTop = -height * 0.16;

  // 雨的色相：素材色往冷灰蓝推（暴雨天光是低饱和的）。
  const rainColor = color.clone().lerp(new THREE.Color('#8FB4D8'), 0.7);
  const wetColor = color.clone().lerp(new THREE.Color('#1B2733'), 0.82);
  const sheenColor = color.clone().lerp(new THREE.Color('#DCEBFF'), 0.8);
  const fogColor = new THREE.Color('#9FB2BF');

  // ④雨幕深浅：远层灰幕，铺满全屏（「最满的素材」）。
  const haze = res.mesh(
    'rain-haze',
    new THREE.PlaneGeometry(width * 1.15, height * 1.15),
    createAdditivePlaneMaterial({
      fragmentShader: DOWNPOUR_HAZE_FRAGMENT,
      uniforms: {
        uColor: { value: rainColor },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uWindAngle: { value: 0 },
        uDensity: { value: 0 },
      },
    }),
  );
  haze.position.set(0, 0, -14);
  res.group.add(haze);

  // ⑥积水反光：地面镜面，用常规混合（它要遮住下方而非只叠光）。
  const puddle = res.mesh(
    'puddle-mirror',
    new THREE.PlaneGeometry(width * 1.1, height * 0.5),
    createBlendedPlaneMaterial({
      fragmentShader: DOWNPOUR_PUDDLE_FRAGMENT,
      uniforms: {
        uColor: { value: wetColor },
        uSheenColor: { value: sheenColor },
        uTime: { value: 0 },
        uAlpha: { value: 0 },
        uLevel: { value: 0 },
        uWindAngle: { value: 0 },
        uFlash: { value: 0 },
      },
    }),
  );
  puddle.position.set(0, -height * 0.28, -10);
  res.group.add(puddle);

  // ⑧雾气沿地：贴地低雾，压在积水之上。
  const groundFog = res.mesh(
    'ground-fog',
    new THREE.PlaneGeometry(width * 1.2, height * 0.42),
    createAdditivePlaneMaterial({
      fragmentShader: DOWNPOUR_GROUNDFOG_FRAGMENT,
      uniforms: {
        uColor: { value: fogColor },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uWindAngle: { value: 0 },
      },
    }),
  );
  groundFog.position.set(0, -height * 0.3, -5);
  res.group.add(groundFog);

  // ⑤闪电间隙亮光：远处弱闪，整幕提亮用一层素材色平面即可
  // （远闪没有可辨的分支形态，只有天光整体一亮）。
  const flashVeil = res.mesh(
    'far-flash',
    new THREE.PlaneGeometry(width * 1.2, height * 1.2),
    createAdditivePlaneMaterial({
      fragmentShader: `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  // 上缘最亮：远闪在云层里，光从上方漫射下来。
  float grad = smoothstep(-0.15, 1.0, vUv.y);
  gl_FragColor = vec4(uColor, grad * uAlpha);
}`,
      uniforms: {
        uColor: { value: sheenColor },
        uAlpha: { value: 0 },
      },
    }),
  );
  flashVeil.position.set(0, 0, -16);
  res.group.add(flashVeil);

  // ②地面雨舞的白雾团：溅点上方的水汽。
  const puffs: SplashPuff[] = [];
  const puffGeometry = res.track(new THREE.CircleGeometry(short * 0.055, 24));
  for (let i = 0; i < SPLASH_PUFF_COUNT; i += 1) {
    const material = res.track(new THREE.MeshBasicMaterial({
      color: sheenColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }));
    const mesh = new THREE.Mesh(puffGeometry, material);
    mesh.name = `splash-${i}`;
    const x = (i / (SPLASH_PUFF_COUNT - 1) - 0.5) * width * 1.02;
    mesh.position.set(x, groundBottom + height * 0.06, -4);
    res.group.add(mesh);
    puffs.push({ mesh, x, phase: ((i * 41) % 100) / 100 });
  }

  return { res, haze, puddle, groundFog, flashVeil, puffs, short, groundTop, groundBottom };
}
