/**
 * 场景 07 crystal 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：塔芯蓄力、贴地尘雾与屏缘色散只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ① 塔芯蓄力辉光：第一幕悬停期沿轴心聚能。
 *
 * uCharge 抬升时亮带由塔基向塔顶收束——蓄力的方向感来自击中点在塔顶，
 * 与 8 层自上而下剥离的动机是同一个。
 */
export const TOWER_CORE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uCharge;
uniform float uTime;
${NOISE_CHUNK}
void main() {
  // 轴心亮带：越靠中轴越亮，横向高斯收束。
  float axis = exp(-pow((vUv.x - 0.5) / 0.16, 2.0));
  // 能量自下而上爬：uCharge 是爬升前沿的位置。
  float front = smoothstep(uCharge - 0.35, uCharge + 0.05, vUv.y);
  float pulse = 0.72 + 0.28 * sin(uTime * 9.0 + vUv.y * 14.0);
  float grain = 0.78 + 0.22 * fbm(vec2(vUv.x * 6.0, vUv.y * 9.0 - uTime * 1.4));
  float a = axis * (1.0 - front) * uCharge * pulse * grain;
  if (a < 0.005) discard;
  gl_FragColor = vec4(uColor * (1.3 + uCharge * 1.6), a * 0.85);
}`;

/**
 * ③ 棱光：折射色块，色相随机偏转。
 *
 * uBurst 由「本帧有几层在剥」驱动，所以色块爆发是剥离事件的直接结果，
 * 不是自走的时间曲线。uHue 让每一块的色相各自偏转，形成棱镜分光感。
 */
export const PRISM_GLOW_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uBurst;
uniform float uHue;
uniform float uTime;
${NOISE_CHUNK}
// 色相旋转：棱镜分光的本质是同一束光按波长散开，用 hue 偏转最省算力。
vec3 hueShift(vec3 col, float shift) {
  const vec3 k = vec3(0.57735);
  float c = cos(shift);
  return col * c + cross(k, col) * sin(shift) + k * dot(k, col) * (1.0 - c);
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  // 六棱分光：水晶是六方晶系，色块沿 6 个方位散开才合材质。
  float blades = pow(max(0.0, cos(ang * 3.0 + uHue * 6.283)), 8.0);
  float shell = exp(-pow((r - 0.42) / 0.34, 2.0));
  float shimmer = 0.7 + 0.3 * fbm(vec2(ang * 3.0, uTime * 1.6));
  float a = (blades * shell + shell * 0.22) * uBurst * shimmer;
  if (a < 0.005) discard;
  vec3 col = hueShift(uColor, uHue * 6.283 + r * 2.2);
  gl_FragColor = vec4(col * 1.9, a * 0.8);
}`;

/**
 * ⑥ 底部尘雾：体积雾沿地铺开。
 *
 * 两个强度分开：uKick 是晶屑砸地扬起的即时尘（互动①的落点），
 * uSettle 是第三幕的沉积量。分开才能表达「先被砸起、后慢慢落定」，
 * 合成一个值就只能是一条曲线。
 */
export const DUST_VEIL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uKick;
uniform float uSettle;
uniform float uTime;
${NOISE_CHUNK}
void main() {
  // 贴地：雾在下缘最厚，向上迅速稀薄。
  float ground = pow(max(0.0, 1.0 - vUv.y), 1.7);
  float roll = fbm(vec2(vUv.x * 3.4 + uTime * 0.09, vUv.y * 5.2 - uTime * 0.05));
  float body = smoothstep(0.34, 0.82, roll) * ground;
  // 扬尘被砸起时抬得更高，沉积时压回地面。
  float lift = uKick * (1.0 - smoothstep(0.0, 0.55 + uKick * 0.35, vUv.y));
  float a = body * (uKick * 0.85 + uSettle * 0.7) + lift * 0.28;
  if (a < 0.005) discard;
  gl_FragColor = vec4(uColor * (0.72 + uSettle * 0.3), min(0.82, a));
}`;

/**
 * ⑦ 折射光棱：屏缘色散。
 *
 * 只在画面四缘着色，中心留空——色散是介质边界效应，
 * 铺满全屏会变成一层彩色滤镜，把晶塔本身的折射感盖掉。
 */
export const EDGE_DISPERSION_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  // 到最近屏缘的距离：取两轴最大值，越靠边越接近 1。
  float edge = max(p.x, p.y);
  float band = smoothstep(0.55, 1.0, edge);
  // RGB 三通道错相：色散的可见形式就是三原色分离。
  float wave = uTime * 1.8 + edge * 9.0;
  vec3 split = vec3(
    0.5 + 0.5 * sin(wave),
    0.5 + 0.5 * sin(wave + 2.094),
    0.5 + 0.5 * sin(wave + 4.188)
  );
  float a = band * uIntensity;
  if (a < 0.005) discard;
  gl_FragColor = vec4(mix(uColor, split, 0.75) * 1.5, a * 0.6);
}`;
