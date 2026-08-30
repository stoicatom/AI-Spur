/**
 * 场景 09 flame 的 GLSL。
 *
 * 火舌的宽度剖面与蓝焰占比**与 TS 侧 flame-plume.ts 同源**：
 * 同一条曲线两处实现，参数必须一致。本项目 trumpet/aurora 都踩过
 * 「测的曲线与画的曲线不是同一条」——测出的方向性与画面脱钩，
 * 断言全绿而观感错误。改任一侧都要同步另一侧。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ① 火舌：向上卷动的连续火焰流，内焰蓝外焰橙。
 *
 * 「连续流」是本场景的签名之一，所以噪声必须沿 **-y 方向平流**
 * （火焰把纹理往上带），而不是原地闪烁。原地闪烁会读成一片抖动的
 * 色块，不是流动的火。
 */
export const FLAME_TONGUE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;      // 外焰橙
uniform vec3 uCoreColor;  // 内焰蓝
uniform float uAlpha;
uniform float uTime;
uniform float uHeight;    // 归一化火焰高度（plumeHeight）
uniform float uFlicker;   // 抖动 -1→1
${NOISE_CHUNK}

// 宽度剖面：与 TS 侧 plumeWidth 同源，峰值在 0.22（篝火鼓肚很低），
// 根部保留 0.46 基底宽度（火贴在柴堆上是一片，不是一个尖）。
float widthProfile(float h) {
  float rise = 0.46 + 0.54 * pow(max(h, 0.0) / 0.22, 0.85);
  float fall = pow(max(1.0 - h, 0.0) / 0.78, 1.15);
  return h < 0.22 ? min(1.0, rise) : max(0.0, fall);
}

// 蓝焰占比：与 TS 侧 blueCoreShare 同源，只在根部 0.3 以内。
float blueShare(float h) {
  return max(0.0, 1.0 - h / 0.3);
}

void main() {
  // 贴片下沿为火焰根部。
  float h = vUv.y;
  if (h > uHeight) { discard; }

  // 归一到当前火高，使剖面随火焰整体伸缩而不是被裁切。
  float hn = h / max(uHeight, 0.001);
  float halfW = widthProfile(hn);
  float dx = abs(vUv.x - 0.5) * 2.0;

  // 平流噪声：往上带（-y），越高流得越快（浮力加速）。
  float flow = uTime * (0.9 + hn * 1.4);
  float n = fbm(vec2(vUv.x * 6.2, vUv.y * 3.4 - flow));
  // 抖动让边缘呼吸；根部锚定在柴堆上所以幅度乘 hn。
  float wob = (n - 0.5) * (0.42 + uFlicker * 0.12) * hn;
  float edge = halfW + wob;

  float body = smoothstep(edge, edge - 0.34, dx);
  if (body <= 0.001) { discard; }

  // 顶端撕成断续的火舌尖：高处用噪声再切一刀。
  float tip = mix(1.0, smoothstep(0.34, 0.72, n), smoothstep(0.55, 1.0, hn));

  vec3 col = mix(uColor, uCoreColor, blueShare(hn));
  // 芯部更亮：中轴附近是高温区。
  col += uCoreColor * (1.0 - dx) * 0.34 * blueShare(hn);
  float a = body * tip * uAlpha * (0.62 + n * 0.5);
  gl_FragColor = vec4(col, a);
}`;

/**
 * ③ 热浪：屏幕折射。
 *
 * 没有真的做屏幕采样（正交叠加层拿不到背景纹理），改用**高频细纹
 * 的亮度扰动**在视觉上冒充折射——热空气把背后的光揉成波纹。
 * 强度由 TS 侧 heatShimmer 给，它比火焰高度滞后（热柱要先积累）。
 */
export const FLAME_HEAT_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uStrength;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv;
  // 竖向拉长的噪声：热浪是上升的柱状结构。
  float n = fbm(vec2(p.x * 9.0, p.y * 2.6 - uTime * 1.6));
  float n2 = fbm(vec2(p.x * 17.0 + 3.1, p.y * 4.2 - uTime * 2.3));
  float ripple = (n - 0.5) * 0.6 + (n2 - 0.5) * 0.4;

  // 只在火柱正上方一带出现，且离火越远越弱。
  float column = smoothstep(0.62, 0.12, abs(p.x - 0.5));
  float rise = smoothstep(0.0, 0.34, p.y) * smoothstep(1.0, 0.42, p.y);
  float a = abs(ripple) * column * rise * uStrength * uAlpha * 2.2;
  gl_FragColor = vec4(uColor, a);
}`;

/**
 * ⑧ 地面光池：柴堆脚下的橙光圈。
 *
 * 亮度随 uGate（光影脉动的同一个门控）变化——地面被火照亮，
 * 所以它必然与光影脉动同步，不能自己定一套节奏。
 */
export const FLAME_POOL_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGate;
${NOISE_CHUNK}
void main() {
  // 椭圆距离：地面光池在透视下是压扁的。
  vec2 d = (vUv - vec2(0.5, 0.5)) * vec2(1.0, 2.35);
  float r = length(d) * 2.0;
  float pool = smoothstep(1.0, 0.0, r);
  // 边缘用噪声打碎，避免读成一个规整的椭圆贴花。
  float n = valueNoise(vUv * 8.0);
  pool *= 0.74 + n * 0.4;
  float a = pool * uAlpha * (0.5 + uGate * 0.6);
  gl_FragColor = vec4(uColor, a);
}`;

/**
 * ⑦ 背景星火：寒夜的稀疏光点。
 *
 * 与⑥火星（quarks，从火里升起）是不同的东西：这层是**背景恒定的
 * 远景光点**，不参与火焰的因果链，只提供「寒夜」的环境。
 * 用 hash 网格而非粒子，成本近零。
 */
export const FLAME_NIGHT_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
${NOISE_CHUNK}
void main() {
  vec2 g = vUv * vec2(34.0, 22.0);
  vec2 cell = floor(g);
  vec2 f = fract(g) - 0.5;
  float pick = hash12(cell);
  // 只有约 1/8 的格子有星，其余留空。
  if (pick < 0.87) { discard; }

  float twinkle = 0.6 + 0.4 * sin(uTime * (1.4 + pick * 3.2) + pick * 31.0);
  float star = smoothstep(0.34, 0.0, length(f)) * twinkle;
  // 上半屏更密（地面附近被柴堆与地形挡住）。
  float band = smoothstep(0.18, 0.72, vUv.y);
  gl_FragColor = vec4(uColor, star * band * uAlpha);
}`;
