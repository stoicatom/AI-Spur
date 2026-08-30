/**
 * 场景 11 thunder 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：这几段都以「一圈贴在地面上的波」为前提
 * （环心锁在地面线、亮度沿地面摊薄），只有本场景用得上。天空暗闪仍复用
 * 工具层的 VOLUME_CLOUD_FRAGMENT——那才是多场景共享的通用件（§4.1 规则 2）。
 *
 * 压扁不在 shader 里做：贴地是**几何事实**，写在 mesh 的 scale.y 上
 * （见 thunder-parts 的 flattenGround），场景树里量一眼就知道这圈波是躺着的。
 * shader 因此只处理各向同性的圆形距离场，两者不重复压扁。
 */

/**
 * ② 环形冲击波单层：一圈外扩的波前 + 内侧余压尾。
 *
 * uRadius 是**归一化到贴片半宽**的前沿半径，由编排层从像素半径换算。
 * 波前用高斯带而非硬边：真实激波在屏幕上是一条有厚度的亮带。
 */
export const SHOCK_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float front = exp(-pow((r - uRadius) / max(0.004, uThickness), 2.0));
  // 波前内侧的余压尾：空气被推走后留下的低压区，读作环在「拖」着走。
  float wake = r < uRadius
    ? pow(max(0.0, 1.0 - (uRadius - r) / max(0.02, uRadius)), 3.0) * 0.22
    : 0.0;
  float a = (front + wake) * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + front * 1.8), a);
}`;

/**
 * ③ 山谷回响尾迹：地面上往复叠加的光波。
 *
 * 与 ② 分成两层材质，因为回响是被谷壁反射后**向内回传**的那一支
 * （uRadius 递减），还要叠一组同心驻波纹；合进 ② 就没法让它与主环反向。
 */
export const VALLEY_ECHO_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uRipples;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ring = exp(-pow((r - uRadius) / 0.075, 2.0));
  // 同心驻波：谷壁多次反射叠出的纹，沿半径周期分布。
  float standing = pow(max(0.0, sin((r - uRadius) * uRipples)), 4.0) * 0.35;
  // 贴地光在远处摊薄（能量摊在更长的圆周上）。
  float spread = pow(max(0.0, 1.0 - r * 0.55), 1.6);
  float a = (ring * 0.9 + standing) * spread * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.5, a);
}`;

/**
 * ① 地裂雷光：沿地面横向撕开的分支电光。
 *
 * uReveal 控制从震中往两侧撕开的进度——裂缝是**展开**的而不是整条淡入，
 * 这是「地裂」与「一条横放的电弧」的分别。
 */
export const GROUND_CRACK_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uGlowColor;
uniform float uAlpha;
uniform float uReveal;
uniform float uFlicker;
float h(float x) { return fract(sin(x * 91.7) * 43758.5453); }
void main() {
  // ax 从震中量起：0 = 震中，1 = 贴片两端。
  float ax = abs(vUv.x - 0.5) * 2.0;
  if (ax > uReveal) discard;
  // 主缝：一条抖动的折线，越远越歪（岩体沿弱面走）。
  float wobble = (h(floor(vUv.x * 46.0)) - 0.5) * 0.16 * (0.25 + ax);
  float dy = abs(vUv.y - 0.5 - wobble);
  float seam = exp(-pow(dy / 0.055, 2.0));
  // 分支：从主缝斜岔出的短叉，按格随机开合。
  float cell = floor(vUv.x * 23.0);
  float branch = step(0.62, h(cell + 3.0))
    * exp(-pow((dy - 0.14 * h(cell)) / 0.05, 2.0)) * 0.55;
  // 正在断裂的前沿最亮。
  float tip = exp(-pow((ax - uReveal) / 0.09, 2.0)) * 1.4;
  float a = (seam + branch) * uAlpha * (0.7 + 0.3 * uFlicker);
  a += tip * seam * uAlpha * 0.6;
  vec3 col = mix(uColor, uGlowColor, clamp(seam + tip, 0.0, 1.0));
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * 1.6, a);
}`;

/**
 * ⑧ 空气冷凝纹：贴地的一条低矮雾带。
 *
 * uRadius 是雾带当前所在的环半径（滞后于波前）：超压过后气压骤降，
 * 空气在波后凝出一圈白纹。所以它是一条**跟着环走的带**，
 * 而不是铺满地面的静态雾。
 */
export const CONDENSE_MIST_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uWidth;
uniform float uTime;
float hh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float band = exp(-pow((r - uRadius) / max(0.01, uWidth), 2.0));
  // 沿环周向的絮状起伏：雾不是一圈干净的线。
  float ang = atan(p.y, p.x);
  float fluff = 0.55 + 0.45 * sin(ang * 7.0 + uTime * 1.7) * sin(ang * 3.0 - uTime * 0.9);
  float grain = 0.7 + 0.3 * hh(floor(vUv * 90.0));
  // 贴地：越靠贴片下缘越浓。
  float hug = pow(max(0.0, 1.0 - vUv.y), 1.3);
  float a = band * fluff * grain * hug * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/** ⑥ 远山剪影：层叠暗色山脊，被环波掠过时轮廓被照亮（uRim）。 */
export const RIDGE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uAlpha;
uniform float uRim;
uniform float uSeed;
float rh(float x) { return fract(sin(x * 127.1 + uSeed * 13.7) * 43758.5453); }
float ridgeAt(float x) {
  float g = x * 7.0;
  float i = floor(g);
  float f = fract(g);
  f = f * f * (3.0 - 2.0 * f);
  return mix(rh(i), rh(i + 1.0), f);
}
void main() {
  float h = 0.30 + ridgeAt(vUv.x) * 0.44 + ridgeAt(vUv.x * 2.7) * 0.16;
  if (vUv.y > h) discard;
  // 山脊线附近一条亮边：被环波照亮的轮廓。
  float edge = exp(-pow((h - vUv.y) / 0.035, 2.0));
  vec3 col = mix(uColor, uRimColor, clamp(edge * uRim, 0.0, 1.0));
  float a = uAlpha * (0.72 + edge * uRim * 0.9);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;
