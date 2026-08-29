/**
 * 场景 06 katana 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：刀气弧的弧形冲击波、玻璃裂纹式屏闪、
 * 月光静场三者都只有居合斩用得上，放进共享库会糊掉
 * 「工具层只放通用件」的边界（设计规格 §4.1 规则 2）。
 */

/**
 * ③ 刀气弧：弧形冲击波前沿。
 *
 * uSweep 同时管在场与否和弧的锐度——静场期为 0 时整层 discard，
 * 于是「第一幕全暗」是 shader 的性质，不靠调用方记得把 opacity 归零。
 * 弧不是圆环：横向拉成弓形，两端渐隐，才像刀锋划出的气刃而非爆炸环。
 */
export const AURA_ARC_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uSweep;
uniform float uThickness;
void main() {
  if (uSweep < 0.001) discard;
  vec2 p = (vUv - 0.5) * 2.0;
  // 弓形：以 x 为弦、y 为矢，弧线本体是一条抛物线前沿。
  float front = p.x * 0.42;
  float d = abs(p.y - front * front * 1.6 + 0.25);
  float band = exp(-pow(d / max(0.02, uThickness), 2.0));
  // 两端渐隐：气刃中段最实，弧尾散开。
  float taper = pow(max(0.0, 1.0 - abs(p.x)), 0.85);
  float a = band * taper * uSweep;
  if (a < 0.004) discard;
  // 前沿比弧体更白：冲击波压缩空气的高光。
  gl_FragColor = vec4(mix(uColor, vec3(1.0), band * 0.72), a);
}`;

/**
 * ⑥ 屏裂闪光：玻璃裂纹式全屏白光。
 *
 * uFlash 单独一路而不是复用 material.opacity：闪白既要抬整屏底光
 * 也要让裂纹自身过曝，两者的曲线不同（底光先退、裂纹残留稍久）。
 * uAngle 让裂纹沿斩击轴生长，裂纹方向因此与斩击线同源而非各自随机。
 */
export const SCREEN_CRACK_FRAGMENT = `
varying vec2 vUv;
uniform float uFlash;
uniform float uAngle;
uniform vec3 uTint;
float hash11(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
void main() {
  if (uFlash < 0.001) discard;
  vec2 p = (vUv - 0.5) * 2.0;
  // 转到斩击轴坐标系：s 沿斩击线，n 为垂距。
  float c = cos(-uAngle);
  float s = sin(-uAngle);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  // 裂纹：沿轴分段，每段以随机斜率斜切出去，形成玻璃状放射纹。
  float seg = floor(q.x * 5.0);
  float slope = (hash11(seg) - 0.5) * 2.4;
  float crack = exp(-pow(abs(q.y - slope * fract(q.x * 5.0)) / 0.06, 2.0));
  // 底光：整屏抬白，中段沿斩击线更亮。
  float glow = pow(max(0.0, 1.0 - abs(q.y) * 0.55), 2.0);
  float a = clamp(uFlash * (0.55 + glow * 0.45) + crack * uFlash * 0.9, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.82 + crack * 0.18), a);
}`;

/**
 * ⑧ 月光静场：背景暗场 + 月晕。
 *
 * uGlow 是静场的唯一在场信号（第一幕只有它亮），
 * uDark 单独控暗场浓度，让爆发时背景压得更黑以拉高对比——
 * 签名「静场→爆发对比」在背景层也参一份，不只靠前景变亮。
 */
export const MOONLIGHT_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uGlow;
uniform float uDark;
uniform vec2 uMoon;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 暗场：四角压得比中心更黑，视线自然收到画面中央。
  float vignette = pow(length(p) * 0.62, 1.7);
  float dark = clamp(uDark * (0.42 + vignette), 0.0, 0.96);
  // 月晕：月心一个小实盘 + 大范围柔晕。
  float d = length(p - uMoon);
  float disc = smoothstep(0.115, 0.085, d);
  float halo = exp(-pow(d / 0.44, 1.7)) * 0.5;
  float moon = (disc + halo) * uGlow;
  vec3 col = mix(vec3(0.0), uColor, clamp(moon * 1.4, 0.0, 1.0));
  float a = clamp(dark + moon, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/**
 * ⑤ 残影定格：半透明人影轮廓。
 *
 * 三层 ghost 共用这段，靠 uFade 与 uSkew 区分——定格影是「同一个动作的
 * 三个瞬间」，形状同源、只有淡出快慢与倾斜量不同，各写一份反而会走形。
 */
export const GHOST_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uFade;
uniform float uSkew;
void main() {
  if (uFade < 0.001) discard;
  vec2 p = (vUv - 0.5) * 2.0;
  // 斜切：定格影随斩击方向倾倒，越靠上偏得越多。
  p.x -= p.y * uSkew;
  // 人影：上窄下宽的纺锤形，边缘羽化。
  float body = 1.0 - smoothstep(0.28 + p.y * 0.14, 0.62 + p.y * 0.14, abs(p.x));
  float vertical = smoothstep(-1.0, -0.72, p.y) * smoothstep(1.0, 0.7, p.y);
  float a = body * vertical * uFade * 0.55;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;
