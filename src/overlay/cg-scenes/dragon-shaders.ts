/**
 * 场景 04 dragon 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：珠光沿鳞流走与「云被龙身挤出空隙」只有本场景
 * 用得上，放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * 雨丝复用工具层附近的 RAIN_FRAGMENT 语义即可，不在此重写。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ② 鳞光单带：一段沿链的鳞面。
 *
 * uFlow 是「珠光此刻流到本带的强度」，与 material.opacity 分开两路，
 * 因为鳞带本身在龙现身时就该可见，珠光是叠在它上面游走的另一层亮度——
 * 只调 opacity 会让「珠光流走」退化成「整条龙一起明暗」。
 */
export const SCALE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uPearlColor;
uniform float uFlow;
uniform float uAlpha;
void main() {
  // 横向鳞片格纹 + 纵向脊线：给链身表面一点方向感。
  float rows = fract(vUv.x * 7.0);
  float scaleEdge = smoothstep(0.0, 0.18, rows) * smoothstep(1.0, 0.72, rows);
  float ridge = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 1.6);
  float flow = clamp(uFlow, 0.0, 1.0);
  // 珠光把鳞面往珠色推，并沿鳞片纵向拉出一道高光。
  vec3 lit = mix(uColor, uPearlColor, flow * 0.85);
  float a = (0.32 + scaleEdge * 0.5 + ridge * 0.3) * uAlpha * (0.6 + flow * 1.4);
  if (a < 0.004) discard;
  gl_FragColor = vec4(lit * (1.0 + flow * 1.3), clamp(a, 0.0, 1.0));
}`;

/**
 * ③ 龙爪扰动云：FBM 云海，uGaps 挖出龙身/龙息推开的空隙。
 *
 * uGaps 与 uDensity 分两路：密度是云本身厚薄（按幕推进），
 * 空隙是被外物挤开的孔洞。合成一个 uniform 就没法表达
 * 「云还很厚但中间被劈开一道」这种互动结果。
 */
export const CLAW_CLOUD_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uTime;
uniform float uDensity;
uniform float uGaps;
uniform vec2 uGapCenter;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 双层反向漂移：单层 FBM 平移会像贴图在滑，两层交错才有翻腾感。
  float base = fbm(uv * 3.0 + vec2(uTime * 0.05, uTime * 0.018));
  float detail = fbm(uv * 6.6 - vec2(uTime * 0.032, uTime * 0.011));
  float mass = base * 0.7 + detail * 0.3;
  // 云海铺底：下缘厚、上缘羽化。
  float vertical = smoothstep(0.0, 0.62, 1.0 - uv.y);
  float cloud = smoothstep(0.4, 0.84, mass) * vertical * uDensity;

  // 被挤开的空隙：以 uGapCenter 为心的软孔，半径随 uGaps 张开。
  float d = length((uv - uGapCenter) * vec2(1.6, 1.0));
  float carve = (1.0 - smoothstep(0.0, 0.42, d)) * clamp(uGaps, 0.0, 1.0);
  cloud *= 1.0 - carve * 0.92;

  // 孔缘被照亮：龙鳞/龙息擦过云的边，是这个场景最像 CG 的一处。
  float rim = carve * (1.0 - carve) * 4.0 * uGlow;
  vec3 col = mix(uColor, uRimColor, clamp(rim, 0.0, 1.0));
  float a = clamp(cloud + rim * 0.4, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/**
 * ⑧ 雾境：贴地体积雾层，比云海更薄更慢。
 *
 * 与云海分开一层而不是共用同一材质：雾要在龙息推散云层时**留下**，
 * 视觉上给出「云散了但雾还在」的层次；共用一层就一起被挖空了。
 */
export const MIST_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uDensity;
${NOISE_CHUNK}
void main() {
  // 雾走得比云慢一个量级，才不会和云海同频而糊成一层。
  float n = fbm(vUv * vec2(2.2, 4.4) + vec2(uTime * 0.014, -uTime * 0.006));
  float band = smoothstep(0.0, 0.5, 1.0 - vUv.y) * smoothstep(1.0, 0.62, vUv.y * 0.5);
  float a = smoothstep(0.34, 0.78, n) * band * uDensity * 0.6;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/** ④ 光珠光晕：核心外的软辉，随珠光强度胀缩。 */
export const PEARL_HALO_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uIntensity;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float core = pow(max(0.0, 1.0 - r), 2.6);
  // 一圈细亮环：让珠有「实体边界」而不是一团糊光。
  float shell = exp(-pow((r - 0.44) / 0.1, 2.0)) * 0.55;
  float a = (core + shell) * clamp(uIntensity, 0.0, 2.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + core * 1.6), clamp(a, 0.0, 1.0));
}`;
