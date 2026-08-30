/**
 * 场景 23 trumpet 专属 GLSL。
 *
 * 号口环波是本场景与 bell 的分界：bell 的环是四面均匀的同心圆，
 * 这里的环带在轴向亮、背向暗，形状本身就带方向性。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 号口环波：带方向增益的环带。
 *
 * uAxis 是号口朝向，uHalfAngle 是主瓣半角。环带在角度上被主瓣调制，
 * 因此看到的是一段**扇形波前**而非整圈——这就是「定向号口」。
 */
export const TRUMPET_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
uniform float uAxis;
uniform float uHalfAngle;
uniform vec2 uOrigin;
void main() {
  vec2 d = vUv - uOrigin;
  float r = length(d);
  float off = r - uRadius;
  // 前沿陡、后沿拖长（压缩相在前）。
  float w = off > 0.0 ? uThickness * 0.4 : uThickness;
  float band = exp(-pow(off / max(0.003, w), 2.0));
  if (band < 0.008) discard;

  // 方向增益：与号口轴的夹角决定亮度。
  // 必须与 TS 侧 hornGain 保持同一条曲线——验收量的是 TS 那条，
  // 两边不一致会让「渲染出来的方向性」与「测到的方向性」脱节。
  float ang = atan(d.y, d.x);
  float diff = abs(mod(ang - uAxis + 3.14159265, 6.28318531) - 3.14159265);
  float half = max(0.05, uHalfAngle);
  float gain;
  if (diff < half) {
    float lobe = cos((diff / half) * 1.5707963);
    gain = 0.06 + pow(max(0.0, lobe), 2.6) * 0.94;
  } else {
    // 主瓣外的余弦尾：半角处 0.06 平滑降到 π 处 0.008。
    float k = clamp((diff - half) / (3.14159265 - half), 0.0, 1.0);
    gain = 0.008 + 0.052 * (1.0 + cos(3.14159265 * k)) * 0.5;
  }

  // 能量按 1/r 衰减。
  float spread = 1.0 / (1.0 + uRadius * 3.8);
  float a = band * gain * spread * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.55 + gain * 0.9), min(1.0, a));
}`;

/**
 * 喇叭本体：铜管 + 号口的 SDF 轮廓，带金属反光带。
 *
 * 号口是一段向右张开的锥，管身是几段折返的细管——用 SDF 画而非贴图，
 * 反光带才能跟着形状走。
 */
export const TRUMPET_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uBrass;
uniform vec3 uShine;
uniform float uAlpha;
uniform float uGleam;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;

  // 号口：向 +x 张开的锥（口在右，喉在左）。
  float bellHalf = 0.12 + max(0.0, p.x - 0.1) * 0.62;
  float bell = max(abs(p.y) - bellHalf, abs(p.x - 0.42) - 0.48);

  // 管身：左侧一段水平细管。
  float tube = max(abs(p.y + 0.02) - 0.075, abs(p.x + 0.52) - 0.42);

  // 折返管：下方一段回弯。
  float loop = max(abs(p.y + 0.38) - 0.055, abs(p.x + 0.3) - 0.3);

  float d = min(bell, min(tube, loop));
  if (d > 0.0) discard;

  // 铜色 + 沿管长的高光带：金属光泽。
  float shine = exp(-pow((p.y - 0.045) / 0.05, 2.0));
  float patina = 0.86 + valueNoise(vUv * 18.0) * 0.2;
  vec3 col = mix(uBrass * patina, uShine, shine * (0.35 + uGleam * 0.6));

  // 边缘暗一圈，给出圆管的体积。
  float edge = smoothstep(0.0, -0.06, d);
  gl_FragColor = vec4(col * (0.55 + edge * 0.6), uAlpha);
}`;

/**
 * 共鸣管波：管内自喉向口行进的一道光。
 *
 * uFront 是行进位置（0=喉，1=口）。只在管内一小段亮，
 * 表达「气柱压缩波在管中前进」。
 */
export const TRUMPET_PIPE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFront;
void main() {
  // 沿 x 为管长方向。
  float along = vUv.x;
  float off = along - uFront;
  float pulse = exp(-pow(off / 0.09, 2.0));
  // 管的横截面：中间亮、边缘收。
  float section = 1.0 - pow(abs(vUv.y * 2.0 - 1.0), 2.2);
  float a = pulse * section * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.6 + pulse * 0.8), a);
}`;

/**
 * 背景暖幕：暗红幕布，带垂坠褶皱。
 *
 * 与 harp 的月夜（冷蓝）、guitar 的原木形成第三种舞台底色。
 */
export const TRUMPET_CURTAIN_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uAlpha;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  // 竖向褶皱：低频正弦 + 噪波扰动。
  float fold = sin(vUv.x * 26.0 + valueNoise(vec2(vUv.x * 3.0, 0.5)) * 2.4);
  float shade = 0.62 + fold * 0.16;
  // 上方暗、下方更暗：舞台顶光。
  float vertical = 0.55 + vUv.y * 0.45;
  vec3 col = uColor * shade * vertical;
  // 号声金光把幕布染暖。
  col = mix(col, uGlowColor, uGlow * 0.35);
  gl_FragColor = vec4(col, uAlpha);
}`;
