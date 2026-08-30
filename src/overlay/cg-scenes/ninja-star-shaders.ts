/**
 * 场景 05 ninja-star 专属 GLSL。
 *
 * 没有并进 cg-shaders 工具层：四刃星身的高光扫掠、满月的环形海与月晕、
 * 贴轨迹的风切声纹都只有本场景用得上（设计规格 §4.1 规则 2）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ① 手里剑本体：四刃星形，中心开孔。
 *
 * 用极坐标的 `cos(4θ)` 生成四刃轮廓而不是贴一张星形图：刃尖的锐度
 * （uSharp）与厚度可以随自旋速度变——高速自旋时刃缘被运动模糊抹圆。
 *
 * ③ 金属反光扫掠也在这层：`uSweep` 是一条沿刃面横扫的镜面高光带。
 * 与残影分工明确——残影给「它刚才在哪」，反光给「它是金属」。
 */
export const SHURIKEN_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHiColor;
uniform float uAlpha;
uniform float uSweep;
uniform float uSharp;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float th = atan(p.y, p.x);
  // 四刃轮廓：|cos(2θ)| 的高次幂把四个方向拉成尖。
  float lobe = pow(abs(cos(th * 2.0)), 0.45 + uSharp * 0.55);
  float edge = 0.34 + lobe * 0.62;
  float body = 1.0 - smoothstep(edge - 0.06, edge + 0.02, r);
  // 中心开孔：真手里剑靠这个孔穿绳携带。
  float hole = smoothstep(0.08, 0.13, r);
  float mass = body * hole;
  if (mass < 0.01) discard;
  // ③ 镜面高光带：沿刃面横扫的一条窄亮线，位置由 uSweep 驱动。
  float band = exp(-pow((dot(p, vec2(0.7071, 0.7071)) - uSweep) / 0.16, 2.0));
  // 刃缘本身也亮一圈（金属的棱反光）。
  float rim = exp(-pow((r - edge) / 0.07, 2.0));
  vec3 col = mix(uColor, uHiColor, clamp(band * 0.85 + rim * 0.5, 0.0, 1.0));
  float a = mass * uAlpha * (0.72 + band * 0.28);
  gl_FragColor = vec4(col * (1.0 + band * 1.1 + rim * 0.7), a);
}`;

/**
 * ⑤ 月轮：满月盘面 + 环形月晕。
 *
 * `uEclipse` 是被剑影瞬间遮暗的量（互动③）：整盘压暗而非画一个黑块，
 * 因为遮挡发生在月的**前面**很远处，投在观众眼里是整体的一次变暗。
 */
export const NINJA_MOON_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHaloColor;
uniform float uAlpha;
uniform float uEclipse;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  // 月盘：0.34 半径的实心盘，边缘轻微羽化（大气散射）。
  float disc = 1.0 - smoothstep(0.32, 0.36, r);
  // 月海：低频噪声压暗几块，避免盘面像一张白纸。
  float mare = fbm(vUv * 4.2) * 0.32;
  // 月晕：盘外的一圈弥散光，按距离衰减。
  float halo = exp(-pow((r - 0.36) / 0.34, 2.0)) * 0.42;
  float dim = 1.0 - uEclipse * 0.72;
  vec3 col = mix(uColor * (1.0 - mare), uHaloColor, clamp(halo * 1.6, 0.0, 1.0));
  float a = (disc * 0.92 + halo) * uAlpha * dim;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * dim, a);
}`;

/**
 * ④ 回旋轨迹光带：沿环铺开的一条发光带。
 *
 * `uHead` 是当前扫过的环占比，带子只画到这里——光带因此是「已经飞过的
 * 那段路」，而不是一整条预先画好的环。`uCusp0/1` 在两个切点处加亮：
 * 光带与残影在切点汇合（互动①）在这一层的出口。
 */
export const NINJA_TRAIL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uAlpha;
uniform float uHead;
uniform float uCusp0;
uniform float uCusp1;
uniform float uGlow;
void main() {
  // uv.x = 沿环的占比，uv.y = 带宽方向。
  float s = vUv.x;
  float across = (vUv.y - 0.5) * 2.0;
  // 只画已经飞过的那段。
  if (s > uHead) discard;
  // 带芯亮、边缘虚。
  float core = exp(-pow(across / 0.42, 2.0));
  // 尾部渐隐：离头部越远越淡（光带自己在消散）。
  float age = clamp((uHead - s) / 0.55, 0.0, 1.0);
  float fade = 1.0 - age * 0.82;
  // 两个切点处加亮：光带与残影在此汇合。
  float c0 = exp(-pow((s - uCusp0) / 0.035, 2.0));
  float c1 = exp(-pow((s - uCusp1) / 0.035, 2.0));
  float knot = (c0 + c1) * uGlow;
  vec3 col = mix(uColor, uHotColor, clamp(knot, 0.0, 1.0));
  float a = core * fade * uAlpha * (0.55 + knot * 0.7);
  if (a < 0.005) discard;
  gl_FragColor = vec4(col * (1.0 + knot * 1.6), a);
}`;

/**
 * ⑧ 风切声纹：贴着轨迹的细线组。
 *
 * 声纹是「听得见的东西被画出来」，所以密度与亮度都吃 `uSpeed`——
 * 慢下来就该安静。线沿带宽方向分层，横向按 uv.x 高频振荡。
 */
export const NINJA_WHISTLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uHead;
uniform float uSpeed;
uniform float uPhase;
${NOISE_CHUNK}
void main() {
  float s = vUv.x;
  if (s > uHead) discard;
  float across = (vUv.y - 0.5) * 2.0;
  // 细线：横向的高频条纹，密度随速度上升（快 = 更密的啸叫）。
  float lanes = sin(across * (7.0 + uSpeed * 15.0) + uPhase * 3.1);
  float line = pow(max(0.0, lanes), 4.0);
  // 只在头部附近有声（声源跟着剑走）。
  float near = exp(-pow((uHead - s) / 0.13, 2.0));
  float grain = 0.65 + valueNoise(vec2(s * 40.0 - uPhase * 5.0, across * 6.0)) * 0.6;
  float a = line * near * grain * uAlpha * (0.2 + uSpeed * 0.8);
  if (a < 0.006) discard;
  gl_FragColor = vec4(uColor * 1.5, a);
}`;
