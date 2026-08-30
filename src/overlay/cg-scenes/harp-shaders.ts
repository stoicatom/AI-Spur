/**
 * 场景 22 harp 专属 GLSL。
 *
 * 三段服务「竖列弦 + 花瓣波 + 月夜」：金漆弧架的轮廓辉光、
 * 自上而下的扫描闪光带、月夜背景幕。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 琴柱辉光：沿弧架轮廓的一层金光。
 *
 * 用 SDF 近似弧架形状（一段圆弧带 + 竖直立柱），只在轮廓附近发光——
 * 「轮廓光」的关键是内部不亮，否则就变成一块发光的板。
 */
export const HARP_FRAME_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;

  // 弧架：以右上为圆心的一段圆弧（竖琴的弯梁）。
  vec2 arcCenter = vec2(0.62, 0.72);
  float arcR = 1.28;
  float arc = abs(length(p - arcCenter) - arcR) - 0.05;

  // 立柱：左侧一根竖直柱。
  float pillar = max(abs(p.x + 0.72) - 0.055, abs(p.y) - 0.94);

  // 底座：下缘横梁。
  float base = max(abs(p.y + 0.92) - 0.06, abs(p.x + 0.1) - 0.78);

  float d = min(arc, min(pillar, base));
  // 只在 SDF 零附近发光：这是「轮廓」而非「实心」。
  float edge = exp(-pow(max(0.0, d) / 0.035, 2.0));
  if (edge < 0.01) discard;

  // 金漆有细微磨损纹理。
  float wear = 0.82 + valueNoise(vUv * 24.0) * 0.24;
  vec3 col = uColor * wear * (0.6 + uGlow * 0.9);
  gl_FragColor = vec4(col, edge * uAlpha);
}`;

/**
 * 拨弦闪光带：一道自上而下移动的横向亮线。
 *
 * uBeam 是当前位置（0=顶、1=底）。带子有上下不对称的拖影——
 * 已扫过的一侧留残光，未到的一侧干净，这样「扫描方向」在视觉上明确。
 */
export const HARP_BEAM_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uBeam;
uniform float uWidth;
void main() {
  // vUv.y=1 是顶，换算成「从顶往下」的坐标。
  float pos = 1.0 - vUv.y;
  float off = pos - uBeam;
  // 已扫过（off<0）拖长，未到（off>0）陡。
  float w = off > 0.0 ? uWidth * 0.35 : uWidth;
  float band = exp(-pow(off / max(0.004, w), 2.0));
  // 横向两端收窄，让亮线像被手指带出来的一段而非贯屏直线。
  float taper = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 3.0);
  float a = band * taper * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + band * 0.8), min(1.0, a));
}`;

/**
 * 月夜背景：深蓝夜幕 + 高处月光渗透。
 *
 * 与 moon 场景的月面刻意区分：这里**没有月轮本体**，只有月光造成的
 * 上亮下暗的空气辉光，月亮在画外。
 */
export const HARP_NIGHT_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uSky;
uniform vec3 uMoon;
uniform float uAlpha;
uniform float uTime;
${NOISE_CHUNK}
void main() {
  // 上亮下暗：月光从画外上方渗入。
  float vertical = pow(vUv.y, 1.8);
  // 缓慢流动的薄云，让夜幕不是纯色渐变。
  float haze = fbm(vec2(vUv.x * 2.2 + uTime * 0.02, vUv.y * 3.1));
  vec3 col = mix(uSky, uMoon, vertical * 0.55 + haze * 0.12);
  float a = uAlpha * (0.62 + vertical * 0.38);
  gl_FragColor = vec4(col, a);
}`;
