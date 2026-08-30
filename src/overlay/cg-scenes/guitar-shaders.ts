/**
 * 场景 19 guitar 专属 GLSL。
 *
 * 三段都服务「弦振传波」这条签名链：琴身（带音孔的原木面）、
 * 琴腔共鸣（从音孔往外渗的暖光）、音浪环（声波环的径向波前）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 琴身：原木纹理 + 音孔挖空 + 边缘高光。
 *
 * 音孔用 discard 真的挖掉，而不是画一个黑圆——挖空后琴腔的共鸣光
 * 才能从孔里透出来（琴腔层在琴身之后渲染）。
 */
export const GUITAR_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uAlpha;
uniform vec2 uHole;
uniform float uHoleRadius;
uniform float uShake;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 震动时琴身纹理轻微剪切：视觉上像整块木头在抖。
  uv.x += sin(uv.y * 22.0) * uShake * 0.004;

  // 音孔：真挖空，让琴腔光透出来。
  float hole = distance(uv, uHole);
  if (hole < uHoleRadius) discard;

  // 原木纹：沿长轴的条纹 + 低频色差。
  float grain = valueNoise(vec2(uv.x * 3.0, uv.y * 46.0));
  float patch = fbm(uv * 2.4);
  vec3 wood = uColor * (0.78 + grain * 0.26 + patch * 0.18);

  // 音孔镶边（rosette）：孔缘一圈更深的装饰环。
  float rosette = smoothstep(uHoleRadius * 1.42, uHoleRadius, hole);
  wood = mix(wood, uEdgeColor, rosette * 0.75);

  // 琴身外缘渐暗，给出弧面感。
  vec2 c = uv * 2.0 - 1.0;
  float vign = 1.0 - smoothstep(0.55, 1.12, length(c));

  gl_FragColor = vec4(wood * (0.5 + vign * 0.7), uAlpha * vign);
}`;

/**
 * 琴腔共鸣光：从音孔向外渗出的暖光。
 *
 * 关键是**从孔心起算**的径向衰减：共鸣是腔体内的驻波把能量从孔口
 * 辐射出来，所以最亮处在孔口而非琴身中央。
 */
export const GUITAR_RESONANCE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform vec2 uHole;
${NOISE_CHUNK}
void main() {
  float d = distance(vUv, uHole);
  // 双层：孔口硬核 + 外圈软晕。
  float core = exp(-pow(d / 0.055, 2.0));
  float halo = exp(-pow(d / 0.19, 2.0)) * 0.5;
  // 腔内驻波：低频起伏，让共鸣光在呼吸而不是恒亮。
  float breathe = 0.82 + 0.18 * valueNoise(vec2(uTime * 1.6, 3.7));
  float a = (core + halo) * uAlpha * breathe;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + core * 0.8), min(1.0, a));
}`;

/**
 * 音浪环：单圈声波的径向波前。
 *
 * 波前是**有厚度的环带**且前沿比后沿陡——声波的压缩相在前。
 * uRadius 是当前半径（UV 尺度），环随时间外扩由编排层驱动。
 */
export const GUITAR_WAVE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
uniform vec2 uOrigin;
void main() {
  float d = distance(vUv, uOrigin);
  float off = d - uRadius;
  // 前沿（off>0，环外侧）陡，后沿（off<0，已通过）拖长。
  float w = off > 0.0 ? uThickness * 0.45 : uThickness;
  float band = exp(-pow(off / max(0.004, w), 2.0));
  // 能量按 1/r 衰减：球面波在二维截面上的表现。
  float spread = 1.0 / (1.0 + uRadius * 4.5);
  float a = band * spread * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.6 + band * 0.9), min(1.0, a));
}`;
