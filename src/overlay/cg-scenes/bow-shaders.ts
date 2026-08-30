/**
 * 场景 24 bow 专属 GLSL。
 *
 * 云缝是本场景的签名载体：云层被一道沿箭路的缝切开，缝宽由 uniform
 * 逐段给出，箭过之后缝自己愈合——所以 shader 必须支持「同一条缝的
 * 不同段有不同张开量」，而不是整条缝一个开合系数。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/** 云缝分段数：沿箭路取样，每段有自己的张开量。 */
export const RIFT_SEGMENTS = 12;

/**
 * 被切开的云层。
 *
 * uOpen 是 RIFT_SEGMENTS 个张开量。片元按自己在箭路上的投影位置
 * 取对应段的开度，因此缝可以「前段已愈合、后段刚裂开」。
 */
export const BOW_CLOUD_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uAlpha;
uniform float uTime;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uOpen[${RIFT_SEGMENTS}];
${NOISE_CHUNK}
void main() {
  // 云体：两层反向漂移的 FBM。
  float base = fbm(vUv * 3.4 + vec2(uTime * 0.03, uTime * 0.011));
  float detail = fbm(vUv * 7.1 - vec2(uTime * 0.019, uTime * 0.007));
  float mass = base * 0.66 + detail * 0.34;
  float cloud = smoothstep(0.38, 0.82, mass);
  if (cloud < 0.02) discard;

  // 片元在箭路上的投影：算出它属于第几段、离箭路多远。
  vec2 axis = uTo - uFrom;
  float len2 = max(1e-6, dot(axis, axis));
  float s = clamp(dot(vUv - uFrom, axis) / len2, 0.0, 1.0);
  vec2 foot = uFrom + axis * s;
  float dist = distance(vUv, foot);

  // 取该段的张开量（线性插值相邻两段，缝才不会有台阶）。
  float fseg = s * float(${RIFT_SEGMENTS} - 1);
  int i0 = int(floor(fseg));
  int i1 = min(i0 + 1, ${RIFT_SEGMENTS} - 1);
  float open = mix(uOpen[i0], uOpen[i1], fract(fseg));

  // 缝：开度越大挖得越宽。开度为 0 时完全不挖（云已愈合）。
  float halfWidth = open * 0.055;
  if (dist < halfWidth) discard;

  // 缝缘发光：撕裂处的云被照亮。
  float edge = exp(-pow((dist - halfWidth) / 0.022, 2.0)) * open;
  vec3 col = mix(uColor, uEdgeColor, clamp(edge * 1.5, 0.0, 1.0));

  gl_FragColor = vec4(col * (0.62 + mass * 0.5), cloud * uAlpha);
}`;

/**
 * 弓身：弓臂弧 + 弓弦。
 *
 * 弓弦的拉伸量 uDraw 直接改弦的折点深度——满弓时弦被拉成尖锐的 V，
 * 松弦后回到近乎直线。这让「拉满→松」在几何上真实发生。
 */
export const BOW_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uWood;
uniform vec3 uString;
uniform float uAlpha;
uniform float uDraw;
uniform float uShake;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 震动：弓臂横向抖，幅度由 uShake 给。
  p.x += sin(p.y * 7.0) * uShake * 0.05;

  // 弓臂：一段以右侧为圆心的弧（弓背朝右）。
  float limb = abs(length(p - vec2(0.92, 0.0)) - 1.05) - 0.045;

  // 弓弦：从上梢到下梢，中点被拉向 -x（拉弓方向）。
  // 折点深度 = uDraw，满弓时弦成尖 V。
  float notch = -uDraw * 0.55;
  float t = clamp((p.y + 0.92) / 1.84, 0.0, 1.0);
  // 两段折线：上梢→折点→下梢。
  float sx = t < 0.5
    ? mix(-0.06, notch, t * 2.0)
    : mix(notch, -0.06, (t - 0.5) * 2.0);
  float str = abs(p.x - sx) - 0.014;
  // 弦只在上下梢之间存在。
  str = max(str, abs(p.y) - 0.92);

  float d = min(limb, str);
  if (d > 0.0) discard;

  // 弓臂是木纹，弦是亮线。
  float isString = step(str, limb);
  float grain = 0.85 + valueNoise(vUv * 22.0) * 0.22;
  vec3 col = mix(uWood * grain, uString, isString);
  float edge = smoothstep(0.0, -0.03, d);
  gl_FragColor = vec4(col * (0.55 + edge * 0.65), uAlpha);
}`;

/**
 * 远处闪电暗场：背景低频闪光。
 *
 * 与 lightning / thunder 刻意区分：这里的闪电**没有可见弧体**，
 * 只有云后透出的整片辉光，是纯背景氛围。
 */
export const BOW_BACKDROP_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uSky;
uniform vec3 uFlashColor;
uniform float uAlpha;
uniform float uFlash;
${NOISE_CHUNK}
void main() {
  // 暗沉夜空，下方更暗。
  float vertical = 0.4 + vUv.y * 0.6;
  // 闪光从右上方的云后透出。
  float d = distance(vUv, vec2(0.72, 0.78));
  float glow = exp(-pow(d / 0.42, 2.0)) * uFlash;
  vec3 col = mix(uSky * vertical, uFlashColor, clamp(glow, 0.0, 0.85));
  gl_FragColor = vec4(col, uAlpha);
}`;
