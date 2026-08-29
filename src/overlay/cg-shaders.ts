/**
 * CG 场景共享 shader 库。
 *
 * 42 个场景的环境场（星空、体积云、透镜、水面…）都从这里取 GLSL 片段，
 * 避免同一段 FBM 噪声在多个场景里各写一份。
 *
 * 设计规格 §4.1 独立性规则 2：本模块只导出着色器片段与材质工厂，
 * 不导出任何成品场景。场景的独立性来自参数与编排，不是各自重写噪声。
 */
import * as THREE from 'three';

/** 全屏/平面几何通用顶点着色器：只把 uv 传下去。 */
export const PLANE_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** 可复用的 hash / FBM 噪声前缀，供各环境场 shader 拼接。 */
export const NOISE_CHUNK = `
float hash12(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += valueNoise(p) * amp;
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}`;

/**
 * 引力透镜环绕扭曲：双臂亮弧 + 爱因斯坦环残影。
 * uStrength 为 0 时整层不可见，方便按幕开合。
 */
export const LENS_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float arc = pow(max(0.0, sin(angle * 2.0 - uTime * 1.1)), 6.0);
  float shell = exp(-pow((r - 0.78) / 0.2, 2.0));
  float a = arc * shell * uStrength;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.8, a * 0.5);
}`;

/**
 * 星场：星点按 uLensing 强度被向心拽弯，越近中心弧度越大。
 * 中心留出暗区，供事件视界之类的实体遮挡。
 */
export const STAR_FIELD_FRAGMENT = `
varying vec2 vUv;
uniform float uTime;
uniform float uLensing;
uniform vec3 uTint;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r = length(c);
  float pull = uLensing * 0.16 / max(0.05, r * r + 0.02);
  vec2 warped = uv - normalize(c + 1e-5) * pull * 0.05;
  vec2 grid = warped * 42.0;
  vec2 cell = floor(grid);
  float star = step(0.965, hash12(cell));
  float d = length(fract(grid) - 0.5);
  float twinkle = 0.6 + 0.4 * sin(uTime * 2.2 + hash12(cell) * 30.0);
  float a = star * (1.0 - smoothstep(0.06, 0.3, d)) * twinkle;
  a *= smoothstep(0.1, 0.24, r);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uTint * 1.4, a * 0.75);
}`;

/** 光子环：引力聚焦亮环，随 uProgress 收紧。 */
export const PHOTON_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uProgress;
uniform float uIntensity;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ringR = 0.62 - uProgress * 0.06;
  float ring = exp(-pow((r - ringR) / 0.055, 2.0));
  float halo = pow(max(0.0, 1.0 - r), 2.4) * 0.35;
  float a = (ring + halo) * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + ring * 2.2), a);
}`;

/**
 * 体积云幕：FBM 翻滚云层 + 内部闪光。
 * 供雷暴、龙卷、雾境等自然族场景共用，密度与内闪由 uniform 区分。
 */
export const VOLUME_CLOUD_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uFlashColor;
uniform float uTime;
uniform float uDensity;
uniform float uFlash;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 双层反向漂移：单层 FBM 平移会显得像贴图在滑，两层交错才有翻腾感。
  float base = fbm(uv * 3.1 + vec2(uTime * 0.06, uTime * 0.021));
  float detail = fbm(uv * 7.3 - vec2(uTime * 0.041, uTime * 0.013));
  float mass = base * 0.68 + detail * 0.32;
  // 云顶厚、云底薄，下缘羽化。
  float vertical = smoothstep(0.0, 0.55, 1.0 - uv.y);
  float cloud = smoothstep(0.42, 0.86, mass) * vertical * uDensity;
  float glow = pow(max(0.0, mass - 0.5), 2.0) * uFlash;
  vec3 col = mix(uColor, uFlashColor, clamp(glow * 1.6, 0.0, 1.0));
  float a = clamp(cloud + glow * 0.55, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

type MaterialOptions = {
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
};

/**
 * 建一个叠加混合的全屏/平面着色材质。
 *
 * 统一关掉 depthWrite/depthTest：特效层全部是叠加光效，
 * 深度参与只会让层与层之间互相裁切。
 */
export function createAdditivePlaneMaterial(options: MaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: options.uniforms,
    vertexShader: PLANE_VERTEX,
    fragmentShader: options.fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
}

/** 建一个常规混合的平面着色材质，用于需要遮挡关系的云幕类实体。 */
export function createBlendedPlaneMaterial(options: MaterialOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: options.uniforms,
    vertexShader: PLANE_VERTEX,
    fragmentShader: options.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}
