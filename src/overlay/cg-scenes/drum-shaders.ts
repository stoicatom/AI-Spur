/**
 * 场景 20 drum 专属 GLSL。
 *
 * 四段都服务「击打-凹陷-反弹」这条签名链：鼓身（红漆桶身+金钉）、
 * 鼓面（牛皮质感，凹陷时中心压暗）、低频环波（粗带波前）、
 * 音浪拖影（低频残留的大面积暖雾）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 鼓身：红漆鼓框 + 一圈金钉（正面视角）。
 *
 * 中心圆区域 discard 挖空，让后面的鼓皮网格透出来——挖空而不是画一个
 * 深色圆，鼓皮的凹陷才真的看得见。鼓框是环带，金钉沿角度周期分布在
 * 环带中线上，是「战鼓」区别于普通圆筒的辨识特征。
 */
export const DRUM_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uStudColor;
uniform float uAlpha;
uniform float uStuds;
uniform float uHeadRadius;
uniform float uShake;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 受击时鼓框整体轻微剪切：整只鼓在震。
  p.x += sin(p.y * 9.0) * uShake * 0.012;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // 鼓皮区挖空：后面的形变网格从这里透出。
  if (r < uHeadRadius) discard;
  if (r > 1.0) discard;

  // 红漆：低频色块 + 细刷痕，避免纯色塑料感。
  float lacquer = 0.8 + fbm(vec2(ang * 1.7, r * 4.0)) * 0.32
                + valueNoise(vec2(ang * 40.0, r * 8.0)) * 0.08;
  // 环带内外缘收暗，给出鼓框的圆筒厚度感。
  float band = smoothstep(uHeadRadius, uHeadRadius + 0.06, r)
             * (1.0 - smoothstep(0.9, 1.0, r));
  vec3 col = uColor * lacquer * (0.55 + band * 0.75);

  // 金钉：沿环带中线按 uStuds 个角度周期排布。
  float mid = (uHeadRadius + 0.92) * 0.5;
  float ring = exp(-pow((r - mid) / 0.052, 2.0));
  float phase = fract((ang / 6.2831853 + 0.5) * uStuds);
  float stud = exp(-pow((phase - 0.5) / 0.19, 2.0)) * ring;
  col = mix(col, uStudColor * 1.6, clamp(stud, 0.0, 1.0));

  float a = uAlpha * band;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/**
 * 鼓面：绷紧的兽皮。
 *
 * uDent 是当前凹陷量（0–1）：凹陷时中心压暗、边缘绷出高光——
 * 顶点已被编排层真实下沉，着色只是把那口"坑"照出来。
 * uDent 为负表示反弹外鼓，中心转亮。
 */
export const DRUM_HEAD_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uAlpha;
uniform float uDent;
${NOISE_CHUNK}
void main() {
  // RingGeometry 的 uv 已是 0–1 方形域，中心在 0.5。
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.02) discard;

  // 皮革：粗糙毛孔 + 大块色差。
  float hide = 0.78 + fbm(vUv * 7.0) * 0.34 + valueNoise(vUv * 42.0) * 0.1;
  vec3 col = uColor * hide;

  // 凹陷：中心压暗（坑底背光），坑缘一圈绷紧高光。
  float bowl = exp(-pow(r / 0.44, 2.0));
  float rim = exp(-pow((r - 0.52) / 0.16, 2.0));
  col *= 1.0 - clamp(uDent, 0.0, 1.0) * bowl * 0.62;
  col = mix(col, uHotColor, clamp(uDent, 0.0, 1.0) * rim * 0.5);
  // 反弹外鼓：中心转亮（皮面迎光）。
  col += uHotColor * max(0.0, -uDent) * bowl * 0.45;

  float a = uAlpha * (1.0 - smoothstep(0.92, 1.02, r));
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/**
 * 低频环波：一层粗环的径向波前。
 *
 * 与 guitar 的音浪环（细亮环、前沿陡）刻意不同：低频波前**厚且钝**，
 * 前后沿都软，因为长波长本就没有锐利边界。uRadius 由编排层驱动。
 */
export const DRUM_RIPPLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
uniform vec2 uOrigin;
uniform float uSquash;
void main() {
  // 环贴地：竖直方向压扁，看着像沿地面荡开而非空中光圈。
  vec2 d = vUv - uOrigin;
  d.y /= max(0.08, uSquash);
  float r = length(d);
  float off = r - uRadius;
  // 低频：前后沿都钝（对比 guitar 的前沿 0.45 倍陡化）。
  float band = exp(-pow(off / max(0.006, uThickness), 2.0));
  // 球面波能量按 1/r 衰减。
  float spread = 1.0 / (1.0 + uRadius * 3.2);
  float a = band * spread * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.55 + band * 0.8), min(1.0, a));
}`;

/**
 * 音浪拖影：低频声压的可视残留。
 *
 * 不是环——是一大团随呼吸起伏的暖雾，中心浓、边缘散。
 * 亮度由延迟线平均驱动（见 drum-impact.boomSmear），因此比凹陷晚散。
 */
export const DRUM_SMEAR_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform vec2 uOrigin;
${NOISE_CHUNK}
void main() {
  vec2 d = vUv - uOrigin;
  d.y /= 0.62;
  float r = length(d);
  // 低频起伏：雾团在呼吸，不是静止的径向渐变。
  float breathe = 0.72 + 0.28 * fbm(vec2(r * 5.0 - uTime * 0.9, uTime * 0.4));
  float body = exp(-pow(r / 0.34, 1.6)) * breathe;
  float a = body * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.6 + body * 0.7), min(1.0, a));
}`;
