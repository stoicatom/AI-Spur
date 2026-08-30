/**
 * 场景 31 tornado 专属 GLSL。
 *
 * 漏斗是规格点名的「SDF 噪声旋转体，全库唯一特例」：用 SDF 描述
 * 上宽下窄的凹曲面，再用噪声扰动表面让它像翻滚的尘柱而不是光滑锥。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 漏斗：SDF 旋转体 + 表面噪声 + 竖向条纹（旋转感）。
 *
 * uMaturity 控制成形度（半径随之缩放），uFlare 是消散外翻量。
 * uSpin 是累计转角——竖向条纹随它平移，让柱体看着在转。
 */
export const TORNADO_FUNNEL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uAlpha;
uniform float uTime;
uniform float uMaturity;
uniform float uFlare;
uniform float uSpin;
uniform float uBaseR;
uniform float uTopR;
${NOISE_CHUNK}
void main() {
  // vUv.y=0 是地面、1 是云底；vUv.x 横向，0.5 为轴心。
  float h = vUv.y;
  float x = (vUv.x - 0.5) * 2.0;

  // 漏斗半径剖面（与 TS 侧 funnelRadius 同一条曲线）。
  float profile = uBaseR + (uTopR - uBaseR) * pow(h, 1.6);
  // 消散外翻：结构在垮而边缘在炸开。
  float radius = profile * uMaturity * (1.0 + uFlare * 1.6);
  if (radius < 0.002) discard;

  float across = abs(x) / radius;
  if (across > 1.0) discard;

  // 表面噪声：把光滑锥打成翻滚的尘柱。相位随 uSpin 平移 → 看着在转。
  float surf = fbm(vec2(x * 3.0 + uSpin * 0.35, h * 4.2 - uTime * 0.9));
  // 竖向条纹：龙卷的螺旋纹理，频率随高度降低（上宽下窄）。
  float stripe = 0.6 + 0.4 * sin((atan(x, 0.35) * 6.0 + uSpin * 2.4) + h * 3.0);

  // 横截面：管壁亮、中心暗（漏斗是空心的）。
  float wall = pow(across, 1.4);
  float hollow = 0.25 + wall * 0.9;

  // 消散时整体透明度掉下去，但外翻处仍有一层亮边。
  float body = hollow * (0.55 + surf * 0.6) * stripe;
  vec3 col = mix(uCoreColor, uColor, wall);
  col += uCoreColor * uFlare * 0.4;

  float a = body * uAlpha * (1.0 - uFlare * 0.35);
  if (a < 0.005) discard;
  gl_FragColor = vec4(col, min(1.0, a));
}`;

/**
 * 地面沙幕：贴地尘圈随风旋转。
 *
 * 用极坐标的螺旋纹：半径方向密度递减、角度方向随 uSpin 转。
 * 这层是「吸入」的地面证据——尘纹是向内收的螺线而非同心圆。
 */
export const TORNADO_SANDSHEET_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSpin;
uniform float uReach;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 纵向压扁：贴地看是椭圆。
  p.y *= 2.6;
  float r = length(p);
  if (r > 1.0) discard;

  float ang = atan(p.y, p.x);
  // 向内收的螺线：ang 与 log(r) 线性相关，这是对数螺线的特征，
  // 也是「尘被吸进去」的可见形态（同心圆表示只转不吸）。
  float spiral = 0.5 + 0.5 * sin(ang * 3.0 - log(max(0.05, r)) * 5.5 + uSpin * 1.8);
  // 近轴密、外围疏。
  float density = smoothstep(1.0, 0.15, r) * (0.4 + spiral * 0.8);
  float grain = 0.75 + valueNoise(vUv * 26.0) * 0.35;

  float a = density * grain * uAlpha * uReach;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.6 + density * 0.6), a);
}`;

/**
 * 风眼光柱：漏斗中央的一道透明柱光。
 *
 * 与漏斗管壁刻意反相：管壁亮时柱心暗，两者叠加才有「空心管」的层次。
 */
export const TORNADO_EYE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uMaturity;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  // 柱心窄，且随成形度收细（成形前是一片散光）。
  float half = 0.28 * (1.3 - uMaturity * 0.5);
  if (x > half) discard;
  float core = pow(1.0 - x / half, 1.8);
  // 上端渐隐（钻进云里）。
  float vertical = smoothstep(1.0, 0.55, vUv.y) * 0.6 + 0.4;
  float a = core * vertical * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + core * 0.7), a);
}`;
