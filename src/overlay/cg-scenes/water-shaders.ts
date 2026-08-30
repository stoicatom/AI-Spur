/**
 * 场景 12 water 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：流体柱的「分缕失稳」、贴面涟漪波前、
 * 池底焦散网与屏缘色散只有本场景用得上，放进共享库会让
 * 「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * 水雾仍复用工具层的 VOLUME_CLOUD_FRAGMENT——那才是多场景共享的通用件。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ① 水柱：涌起的流体柱与它的崩散。
 *
 * 本场景签名的载体。柱体不是「一根发光棒淡入淡出」：
 * - 柱**高**由 mesh 的 scale.y 承担（几何体是单位高的锚底平面），
 *   所以「涌起」在场景树里是真实的高度变化，包围盒能量出来；
 * - `uRise` 是充水程度：刚顶起时柱身还稀薄，涨满后才实；
 * - `uBreak` 把柱身沿横向切成**缕**（strand），流体柱失稳的真实形态是
 *   表面张力撑不住后分裂成丝，而不是整体变淡；
 * - 柱顶始终有一朵翻开的水冠（crown），水跃的顶端不是平截面。
 *
 * 与 downpour 的雨帘形成材质对照：那边是无数条独立的下落细线，
 * 这边是一根**连续柱体**先涌起、再从顶端往下解体。
 */
export const WATER_COLUMN_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCrest;
uniform float uTime;
uniform float uRise;
uniform float uBreak;
${NOISE_CHUNK}
void main() {
  // 锚底几何体：vUv.y = 0 在水面、1 在柱顶，高度已由 scale.y 表达。
  float h = vUv.y;
  float x = vUv.x - 0.5;
  // 外形：底粗顶细。崩散时整体再收一点——水量在往外抛，柱身变瘦。
  float taper = mix(0.46, 0.15, pow(h, 0.72)) * (1.0 - uBreak * 0.34);
  // 表面张力波：沿柱身上行的纵向波纹，崩散期振幅加大（快撑不住了）。
  float wave = fbm(vec2(x * 6.4, h * 5.2 - uTime * 2.4));
  float edge = taper * (1.0 + (wave - 0.5) * (0.34 + uBreak * 0.9));
  float core = 1.0 - smoothstep(edge * 0.34, edge, abs(x));

  // 崩散分缕：只在柱体上段生效，断裂从顶端开始往下走。
  float strand = 0.42 + 0.58 * sin(x * 52.0 + wave * 8.0);
  float shred = mix(1.0, strand, uBreak * smoothstep(0.22, 1.0, h));
  float body = core * shred;

  // 柱顶水冠：一圈翻开的白边，也是水雾与水花的发生处。
  float crown = exp(-pow((h - 0.97) / 0.13, 2.0)) * core;
  vec3 col = mix(uColor, uCrest, clamp(crown * 1.5 + h * 0.32, 0.0, 1.0));
  float a = (body * (0.5 + uRise * 0.45) + crown * 0.62) * (1.0 - uBreak * 0.42);
  if (a < 0.005) discard;
  gl_FragColor = vec4(col * (1.15 + crown * 1.5), min(1.0, a));
}`;

/**
 * ③ 涟漪环：贴着水面外扩的波前。
 *
 * 环宽随半径变薄、幅度随半径衰减——波前展开时同一份能量摊在更长的圆周上。
 * 内侧留一道回波（次级波峰），单环看着像贴图，两环才是浅水重力波。
 * `uRadius <= 0` 时整环不可见：涟漪的**起点由水珠触底决定**（见 cg-water.ts）。
 */
export const RIPPLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uRadius;
uniform float uFade;
void main() {
  if (uRadius <= 0.0) discard;
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float w = 0.045 + 0.085 * (1.0 - uRadius);
  float ring = exp(-pow((r - uRadius) / w, 2.0));
  float echo = exp(-pow((r - uRadius * 0.6) / (w * 1.6), 2.0)) * 0.34;
  float a = (ring + echo) * uFade * (1.0 - uRadius * 0.5);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.35 + ring), a);
}`;

/**
 * ⑤ 底光：水下光斑（焦散网）。
 *
 * 焦散的本质是水面起伏把平行光**折射聚焦**成网，所以这里取两层反向漂移
 * fbm 的**等值线交叠**（|a1 - a2| 接近 0 处）作为亮网，而不是随机画亮点：
 * 交叠线会自然出现分叉、闭合与游走，随机点永远像噪声贴图。
 */
export const BED_CAUSTIC_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uEnergy;
${NOISE_CHUNK}
void main() {
  float a1 = fbm(vUv * vec2(5.2, 3.1) + vec2(uTime * 0.13, -uTime * 0.07));
  float a2 = fbm(vUv * vec2(3.7, 5.4) - vec2(uTime * 0.09, uTime * 0.15));
  float web = pow(max(0.0, 1.0 - abs(a1 - a2) * 3.4), 3.0);
  // 越深越暗：光穿过水体被吸收，池底不是均匀发光板。
  float depth = smoothstep(1.0, 0.12, vUv.y);
  float a = web * depth * uEnergy;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.1 + web * 1.9), a * 0.72);
}`;

/**
 * ⑧ 虹影：屏缘色散微光。
 *
 * 三通道给同一条带**不同相位**——不同波长折射角不同，这就是色散本身。
 * 只在屏缘出现（中心 rim 为 0）：色散是水膜边缘的现象，铺满全屏会变成彩虹滤镜。
 */
export const RAINBOW_FRINGE_FRAGMENT = `
varying vec2 vUv;
uniform float uAlpha;
uniform float uSpread;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float rim = smoothstep(0.52, 1.0, max(abs(p.x), abs(p.y)));
  float band = length(p) * 1.7 - uSpread;
  vec3 col = vec3(
    0.5 + 0.5 * sin(band * 5.2),
    0.5 + 0.5 * sin(band * 5.2 - 2.09),
    0.5 + 0.5 * sin(band * 5.2 - 4.19)
  );
  float a = rim * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * 1.25, a * 0.5);
}`;
