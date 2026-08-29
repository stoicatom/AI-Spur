/**
 * 场景 02 phoenix 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：热浪折射与「被热浪推开的云」只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * 通用 FBM 噪声仍从工具层取，不在这里重写一份。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ⑥ 热浪扭曲层：屏幕空间折射（全库唯一）。
 *
 * 覆盖层没有可采样的背景纹理，所以折射用「按扰动量渲染出可见的折射纹」
 * 来表达——同一条扰动场既画出扭曲纹，也被 ⑦ 云层撕裂当作推开云的位移源，
 * 两层因此共享同一个热浪，而不是各自造一套噪声。
 *
 * uRefract 为 0 时整层不可见，方便按幕开合。
 */
export const HEAT_HAZE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uRefract;
uniform float uCenterY;
${NOISE_CHUNK}
void main() {
  // 热浪自热源向上翻涌：uv.y 反向偏移时间，纹样才是上升而非下落。
  vec2 warp = vec2(fbm(vUv * 5.2 + vec2(uTime * 0.35, -uTime * 0.9)),
                   fbm(vUv * 6.1 - vec2(uTime * 0.27, uTime * 0.75)));
  vec2 offset = (warp - 0.5) * uRefract * 0.14;
  // 折射纹强度取扰动的梯度感：相邻采样差越大，越像被热气掰弯的边。
  float bend = abs(fbm((vUv + offset) * 7.4) - fbm(vUv * 7.4));
  // 越靠热源越剧烈，向上向外衰减。
  float radial = exp(-pow((vUv.y - uCenterY) * 1.9, 2.0));
  float a = bend * radial * uRefract * 2.6;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.55));
}`;

/**
 * ⑦ 云层撕裂：FBM 云被热浪推开。
 *
 * uRift 是撕裂量，来自热浪强度：它把云的采样坐标沿离心方向推出去，
 * 于是中心一带的云真的被挤走留出裂口，而不是简单地把中心 alpha 调低。
 * uLit 是被光柱照亮的量，单独一路，让「爆燃瞬间照亮云层」能与光柱对齐。
 */
export const CLOUD_RIFT_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uLitColor;
uniform float uTime;
uniform float uDensity;
uniform float uRift;
uniform float uLit;
${NOISE_CHUNK}
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c);
  // 推开：越靠裂心推力越大，云被挤到外圈堆叠。
  float push = uRift * exp(-pow(r * 2.4, 2.0)) * 0.42;
  vec2 uv = vUv + normalize(c + 1e-5) * push;
  float base = fbm(uv * 3.4 + vec2(uTime * 0.05, uTime * 0.018));
  float detail = fbm(uv * 7.1 - vec2(uTime * 0.033, uTime * 0.011));
  float mass = base * 0.7 + detail * 0.3;
  float cloud = smoothstep(0.4, 0.85, mass) * uDensity;
  // 裂口本身也要露空：被推走的地方不该还剩一层薄云。
  cloud *= 1.0 - smoothstep(0.0, 0.34, uRift * exp(-pow(r * 2.8, 2.0)));
  // 照亮：光柱从下方打上来，裂口边缘最先亮。
  float rim = pow(max(0.0, mass - 0.42), 1.6) * exp(-pow((r - 0.26) * 3.2, 2.0));
  float glow = rim * uLit;
  vec3 col = mix(uColor, uLitColor, clamp(glow * 2.2, 0.0, 1.0));
  float a = clamp(cloud + glow * 0.6, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/**
 * ⑤ 涅槃光柱：向上的体积光。
 *
 * 走自绘 shader 而非后处理 GodRaysPass：光柱要在爆燃瞬间与云层照度、
 * 冲击环同帧联动，挂在场景里才能与其它元素共用同一个进度源；
 * 后处理链是全屏统一的一道，给不了这种逐元素耦合。
 */
export const NIRVANA_PILLAR_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
${NOISE_CHUNK}
void main() {
  // 柱心亮、两侧羽化；越往上越散，像光在空气里被吃掉。
  float widen = 0.16 + vUv.y * 0.3;
  float core = exp(-pow((vUv.x - 0.5) / widen, 2.0));
  float rise = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
  // 竖向光丝：让柱体有体积感而不是一块渐变。
  float strands = 0.72 + 0.28 * fbm(vec2(vUv.x * 22.0, vUv.y * 3.0 - uTime * 1.4));
  float a = core * rise * strands * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + core * 1.6), clamp(a, 0.0, 1.0));
}`;
