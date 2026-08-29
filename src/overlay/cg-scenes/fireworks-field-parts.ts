/**
 * 场景 41 fireworks 的环境层：⑦夜幕背景、⑧倒影水面、⑨光雾残留。
 *
 * 从 fireworks-parts 再拆一层的理由：环境层是「一整个夜晚」，
 * 与按发成组的弹体元素生命周期完全不同——它全程在场，只改亮度，
 * 而弹体是逐发出生与熄灭。两者混在一个文件既超行数上限也混淆读法。
 */
import * as THREE from 'three';
import type { CgStageContext } from '../cg-scene';
import { NOISE_CHUNK } from '../cg-shaders';
import { additiveMaterial, type SceneResources } from '../cg-scene-kit';

/** 城市遥光：地平线一带的暖色光污染 + 稀疏窗格微光。 */
const CITY_GLOW_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
${NOISE_CHUNK}
void main() {
  // 只在底部一条带里出现：城市在远方地平线上，不该糊满整屏。
  float band = exp(-pow((vUv.y - 0.12) / 0.16, 2.0));
  float skyline = fbm(vec2(vUv.x * 8.0, 0.5));
  // 窗格：足够密的竖向格子，靠 hash 挑亮，其余熄灭。
  vec2 cell = floor(vec2(vUv.x * 190.0, vUv.y * 46.0));
  float window = step(0.955, hash12(cell)) * step(vUv.y, 0.1 + skyline * 0.075);
  float twinkle = 0.75 + 0.25 * sin(uTime * 1.4 + hash12(cell) * 24.0);
  float a = (band * 0.34 + window * twinkle * 0.9) * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.25, a);
}`;

/** 水面：横向压扁的波纹，把上方爆光揉成竖向拉长的倒影。 */
const WATER_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
${NOISE_CHUNK}
void main() {
  // uv.y 压得很扁：波纹沿水平方向铺开，才像贴着水面看过去。
  float ripple = fbm(vec2(vUv.x * 9.0, vUv.y * 26.0 - uTime * 0.85));
  float fade = smoothstep(0.0, 0.7, vUv.y);
  float a = (0.16 + ripple * 0.5) * fade * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.9 + ripple * 0.7), a * 0.55);
}`;

/** 光雾残留：整屏柔光，末幕接管画面。 */
const HAZE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
${NOISE_CHUNK}
void main() {
  float mass = fbm(vUv * 2.4 + vec2(uTime * 0.03, uTime * 0.017));
  // 中上部更浓：烟花散尽后烟雾停留在爆点高度附近。
  float vertical = exp(-pow((vUv.y - 0.62) / 0.42, 2.0));
  float a = smoothstep(0.3, 0.85, mass) * vertical * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a * 0.4);
}`;

type PlaneMaterialFactory = (options: {
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
}) => THREE.ShaderMaterial;

export type FireworksField = {
  starField: THREE.ShaderMaterial;
  cityGlow: THREE.ShaderMaterial;
  waterMaterial: THREE.ShaderMaterial;
  haze: THREE.ShaderMaterial;
  /** 倒影挂载容器（各发的反光贴在这里，随水面一起淡入淡出）。 */
  water: THREE.Group;
  /** 底部水平线：夜幕与水面的分界，给倒影一个物理依据。 */
  horizonLine: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
};

/**
 * 建环境三层。
 *
 * shader 工厂与星场片段由调用方注入，避免本文件再引一次 cg-shaders
 * 造成两处 import 同一模块的重复（工具层已在 parts 主文件取好）。
 */
export function buildFireworksField(
  ctx: CgStageContext,
  res: SceneResources,
  createPlaneMaterial: PlaneMaterialFactory,
  starFieldFragment: string,
): FireworksField {
  // ⑦ 夜幕背景（星空部分）：全屏铺满，规格要求全域覆盖。
  const starField = res.track(createPlaneMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLensing: { value: 0 },
      uTint: { value: new THREE.Color('#8FA6D8') },
    },
    fragmentShader: starFieldFragment,
  }));
  const sky = res.mesh(
    'night-sky',
    new THREE.PlaneGeometry(ctx.width * 1.08, ctx.height * 1.08),
    starField,
  );
  sky.position.z = -70;
  res.group.add(sky);

  // ⑦ 夜幕背景（城市遥光部分）。
  const cityGlow = res.track(createPlaneMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#FFB870') },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    fragmentShader: CITY_GLOW_FRAGMENT,
  }));
  const city = res.mesh(
    'city-glow',
    new THREE.PlaneGeometry(ctx.width * 1.08, ctx.height * 1.08),
    cityGlow,
  );
  city.position.z = -60;
  res.group.add(city);

  // ⑧ 倒影：水面本体 + 分界线，各发反光由 parts 挂进 water 组。
  const water = new THREE.Group();
  water.name = 'water-reflection';
  water.position.z = -40;
  res.group.add(water);

  const waterMaterial = res.track(createPlaneMaterial({
    uniforms: {
      uColor: { value: ctx.color.clone().lerp(new THREE.Color('#5A8CD8'), 0.5) },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    fragmentShader: WATER_FRAGMENT,
  }));
  const surface = res.mesh(
    'water-surface',
    new THREE.PlaneGeometry(ctx.width * 1.08, ctx.height * 0.46),
    waterMaterial,
  );
  // 水面占下方：翻转 uv.y 让 fade 从分界线往下衰减。
  surface.position.y = -ctx.height * 0.34;
  surface.rotation.z = Math.PI;
  water.add(surface);

  const horizonLine = res.mesh(
    'horizon-line',
    new THREE.PlaneGeometry(ctx.width * 1.08, Math.max(1.5, ctx.height * 0.0035)),
    additiveMaterial(new THREE.Color('#FFC98A')),
  );
  horizonLine.position.y = -ctx.height * 0.11;
  water.add(horizonLine);

  // ⑨ 光雾残留：整屏柔光，末幕才浮起来。
  const haze = res.track(createPlaneMaterial({
    uniforms: {
      uColor: { value: ctx.color.clone().lerp(new THREE.Color('#FFE0B8'), 0.45) },
      uTime: { value: 0 },
      uIntensity: { value: 0 },
    },
    fragmentShader: HAZE_FRAGMENT,
  }));
  const hazeMesh = res.mesh(
    'light-haze',
    new THREE.PlaneGeometry(ctx.width * 1.08, ctx.height * 1.08),
    haze,
  );
  hazeMesh.position.z = 20;
  res.group.add(hazeMesh);

  return { starField, cityGlow, waterMaterial, haze, water, horizonLine };
}
