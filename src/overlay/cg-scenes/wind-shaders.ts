/**
 * 场景 13 wind 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：砂纹波痕与 SDF 尘卷锥体只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * ⑦ 云层复用工具层的 VOLUME_CLOUD_FRAGMENT——那才是多场景共享的通用件。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ⑤ 地面砂纹：风成波痕（ripple marks）。
 *
 * 波痕不是同心圆也不是直条：它是**垂直于风向**的一列脊，
 * 脊线本身还被涡流拽弯。所以这里先把 uv 旋到风向坐标系，
 * 再沿风向取周期脊，脊的相位由到涡轴的方位角扰动 —— 于是砂纹自然绕着涡心弯。
 *
 * uStrength 是风力（互动②「砂纹随风力增强」的唯一入口）：
 * 它同时抬高对比度、加密脊线、加深沟槽。做成一个 uniform 而不是三个，
 * 是为了让「随风力增强」只有一个可测真值，不会三条曲线各自漂移。
 */
export const SAND_RIPPLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCrestColor;
uniform float uTime;
uniform float uStrength;
uniform float uAngle;
uniform vec2 uAxis;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 旋到风向坐标系：波痕的脊垂直于风，必须在风的框架里定义。
  float c = cos(uAngle);
  float s = sin(uAngle);
  vec2 w = vec2(p.x * c + p.y * s, -p.x * s + p.y * c);

  // 涡轴方位：脊线相位随方位角偏移，砂纹因此绕着涡心弯而非笔直。
  vec2 d = p - uAxis;
  float swirlPhase = atan(d.y, d.x) * 1.6 - 2.2 / max(0.22, length(d));

  // 脊线：风越强脊越密（波长随风速缩短，与真实波痕一致）。
  float freq = 16.0 + uStrength * 22.0;
  float wobble = (fbm(vec2(w.y * 3.2, w.x * 1.4 + uTime * 0.12)) - 0.5) * 1.7;
  float ridge = sin(w.x * freq + swirlPhase + wobble);
  // 沟槽随风力加深：|ridge| 取高次幂，风强时脊窄沟深。
  float crest = pow(max(0.0, ridge), 1.0 + uStrength * 4.0);

  // 远处砂纹被透视压平（贴地平面的上缘就是远方）。
  float depth = smoothstep(-1.05, 0.35, p.y);
  float a = crest * uStrength * (0.22 + depth * 0.78);
  if (a < 0.004) discard;
  vec3 col = mix(uColor, uCrestColor, crest);
  gl_FragColor = vec4(col, min(0.92, a));
}`;

/**
 * ② 尘卷：SDF 圆锥漏斗体。
 *
 * 用 SDF 距离场而不是一个纹理贴锥形：漏斗的**边界随高度收放**且要沿轴自转，
 * 距离场能让「离轴多远算在卷内」逐像素求解，边缘因此自带羽化，
 * 且能在同一个 shader 里叠上绕轴的螺旋纹（旋转的可见性靠这些纹路）。
 *
 * uSpin 是累计转角（不是时间）：由 wind-field 的闭式积分给出，
 * 让 shader 里的纹路与尘幕/枯叶转的是同一个角。
 */
export const DUST_FUNNEL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uSpin;
uniform float uForm;
uniform float uDensity;
${NOISE_CHUNK}
void main() {
  // 局部坐标：x 横向、y 纵向（0 = 底、1 = 顶）。
  vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);

  // 漏斗剖面：底部收细、顶部张开，成形进度 uForm 控制它从地面长起来。
  float grown = smoothstep(0.0, 1.0, uForm);
  float top = grown;
  if (p.y > top) discard;
  float h = p.y / max(0.04, top);
  // 半径随高度：pow 让腰部内凹，直线锥像个纸筒。
  float radius = (0.12 + 0.88 * pow(h, 0.72)) * grown;
  float d = abs(p.x) - radius;
  // SDF 外侧羽化：尘卷没有硬边界，尘在边缘逐渐稀薄。
  float body = 1.0 - smoothstep(-radius * 0.55, radius * 0.28, d);

  // 绕轴螺旋纹：把横向坐标折成角度，纹路沿高度扭转 —— 这就是「在转」的可见证据。
  float theta = asin(clamp(p.x / max(0.02, radius), -1.0, 1.0));
  float helix = sin(theta * 3.0 + uSpin * 1.15 - h * 9.5);
  float strand = pow(max(0.0, helix), 2.6);
  // 尘团噪声随转角流动，纯螺旋纹会像一根塑料弹簧。
  float grain = fbm(vec2(theta * 2.4 + uSpin * 0.3, h * 4.6 - uSpin * 0.55));

  float a = body * uDensity * (0.3 + strand * 0.5 + grain * 0.42);
  if (a < 0.005) discard;
  // 核部偏亮：漏斗中轴的尘被压得最密。
  vec3 col = mix(uColor, uCoreColor, pow(max(0.0, 1.0 - abs(p.x) / max(0.03, radius)), 2.0));
  gl_FragColor = vec4(col, min(0.85, a));
}`;

/**
 * ⑥ 风眼：中心透明柱光。
 *
 * 「透明」是核心语义——风眼是漏斗内**没有尘**的一段空腔，
 * 因此这里画的是一根中心透光、边缘有亮壁的竖柱，中轴 alpha 反而最低。
 * 若画成一根实心亮柱，读作探照灯而不是风眼。
 */
export const WIND_EYE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uOpen;
uniform float uSpin;
${NOISE_CHUNK}
void main() {
  vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
  float open = smoothstep(0.0, 1.0, uOpen);
  if (open < 0.01) discard;
  // 柱壁：两侧各一道亮壁，中轴留空 —— 空腔感来自这个双峰剖面。
  float r = abs(p.x);
  float wall = exp(-pow((r - 0.34 * open) / 0.13, 2.0));
  float hollow = smoothstep(0.0, 0.3 * open, r);
  // 壁上有随转角流过的微光，静态壁会像两条贴纸。
  float shimmer = 0.62 + 0.38 * fbm(vec2(p.y * 5.2 - uSpin * 0.42, uSpin * 0.2));
  // 顶部渐隐：柱光越高越散。
  float fade = 1.0 - smoothstep(0.35, 1.0, p.y);
  float a = wall * hollow * shimmer * fade * open;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.5, a * 0.6);
}`;
