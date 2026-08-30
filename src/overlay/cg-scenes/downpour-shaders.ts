/**
 * 场景 32 downpour 专属 GLSL。
 *
 * 三段都吃同一个 `uWindAngle`，与 TS 侧 `windAngle` 同源：
 * 规格互动②「风摆改变雨向同时带动涟漪方向」要求角度是**一个**量，
 * 若 shader 自己再写一条风摆曲线，「测到的方向性」与「渲染出的方向性」
 * 就脱钩了（本项目 trumpet / aurora 场景都踩过这个坑）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ⑥积水反光：镜面地面。
 *
 * 湿地面的视觉核心不是「亮」而是**竖向拉长的倒影**：
 * 水面把上方的光源沿垂直方向拉成条带，同时被雨点打碎成细密扰动。
 * 因此噪声在 y 方向压缩 8 倍（拉长条带），并叠一层随风向平移的碎波。
 */
export const DOWNPOUR_PUDDLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uSheenColor;
uniform float uTime;
uniform float uAlpha;
uniform float uLevel;
uniform float uWindAngle;
uniform float uFlash;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv;
  // 近地平线（v→1）积水最先形成，越靠下（近观者）越晚——透视上更远处更早成片。
  float coverage = smoothstep(1.0 - uLevel * 1.15, 1.0 - uLevel * 0.35 + 0.02, p.y);

  // 倒影条带：y 向压缩制造竖向拉伸的镜面感。
  vec2 mirrorUv = vec2(p.x * 3.1, p.y * 0.38 - uTime * 0.05);
  float mirror = fbm(mirrorUv);

  // 雨点碎波：沿风向平移，让水面始终在被砸。
  vec2 dir = vec2(sin(uWindAngle), -cos(uWindAngle));
  float chop = fbm(p * 26.0 + dir * uTime * 3.4);

  float sheen = pow(mirror, 2.2) * 1.5 + chop * 0.22;
  // 远处闪电时整片水面同步提亮——积水是天光的镜子。
  sheen += uFlash * (0.35 + mirror * 0.5);

  vec3 col = mix(uColor, uSheenColor, clamp(sheen, 0.0, 1.0));
  float a = coverage * uAlpha * (0.28 + sheen * 0.62);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

/**
 * ④雨幕深浅（远层）：大气透视。
 *
 * 与 ice 的两层视差**速度**差刻意不同——那条签名归 ice。
 * 这里远层靠**密度与对比度**退到背景里：雨丝被噪声糊成一片灰幕，
 * 只保留方向性，个体不可辨。这才是暴雨里几十米外的样子。
 */
export const DOWNPOUR_HAZE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uWindAngle;
uniform float uDensity;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv;
  // 沿雨向切变：把 uv 沿风向斜置，噪声条纹因此天然是斜雨。
  float tilt = tan(uWindAngle) * 0.55;
  vec2 sheared = vec2(p.x + p.y * tilt, p.y);
  // 竖向高频、横向低频 = 拉长的雨丝；整体随时间向下平移。
  vec2 q = vec2(sheared.x * 42.0, sheared.y * 3.6 - uTime * 5.2);
  float streak = fbm(q);
  // 二次采样错开半个周期，避免单层噪声的可见重复。
  streak = streak * 0.68 + fbm(q * 1.87 + 11.3) * 0.32;

  // 远幕不该有硬边：把对比度压平，只留灰度起伏。
  float veil = smoothstep(0.34, 0.72, streak) * 0.55 + 0.45 * streak;
  float a = veil * uAlpha * uDensity;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
}`;

/**
 * ⑧雾气沿地：贴地低雾层。
 *
 * 与 haze 的区别是**方向**：雾几乎不随雨向斜，它沿地面横向蠕动，
 * 且只存在于画面下缘一条带里。两者若都用同一份噪声就会读成一层。
 */
export const DOWNPOUR_GROUNDFOG_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uWindAngle;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv;
  // 只在下缘成雾，上缘完全透明。
  float band = smoothstep(0.72, 0.06, p.y);
  // 横向蠕动：风向只贡献水平分量（雾没有下落速度）。
  float sway = sin(uWindAngle) * uTime * 0.42;
  float fog = fbm(vec2(p.x * 4.4 + sway, p.y * 7.5 + uTime * 0.22));
  fog = fog * 0.72 + fbm(vec2(p.x * 11.0 - sway * 1.6, p.y * 15.0)) * 0.28;
  float a = band * pow(fog, 1.5) * uAlpha;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
}`;
