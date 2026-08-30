/**
 * 场景 26 axe 专属 GLSL。
 *
 * 三段都为「劈裂木料」服务：木段要读出**顺纹**（纹理方向决定劈裂方向，
 * 横纹木头劈不开），断口要是新鲜撕裂的亮纤维而不是一团光斑，斧身要是
 * 冷钢剪影并在挥砍时被自己的弧光扫亮一瞬。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 原木木段：顺纹纹理 + 断口高亮。
 *
 * uv.x 沿原木轴向（= 纹理方向 = 劈裂方向），uv.y 是横截方向。纹理用沿
 * 轴向拉长的 fbm：条纹**平行于轴**，因此「顺纹劈开」在画面上说得通。
 *
 * `uSplit` 是本段自己的分离进度，`uGlow` 是本段自己的断口亮度——都由
 * 场景层按 `segmentSplitAt(i)` 逐段喂入，不是全局统一值。
 */
export const AXE_LOG_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uAlpha;
uniform float uSplit;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  // 顺纹：噪声沿 x（轴向）拉长 6 倍，于是条纹平行于原木轴。
  float grain = fbm(vec2(vUv.x * 2.4, vUv.y * 14.0));
  float rings = fbm(vec2(vUv.x * 1.1, vUv.y * 5.0));

  // 木色：深浅纹交替，晚材深、早材浅。
  vec3 wood = uColor * (0.62 + grain * 0.5 + rings * 0.22);

  // 断口在**下缘**（裂面一侧）：分离后越张开，断面露出得越多。
  float faceBand = 1.0 - smoothstep(0.0, 0.34, vUv.y);
  // 撕裂的纤维：断面上沿轴向拉出的细丝，比木体亮得多。
  float fibre = pow(fbm(vec2(vUv.x * 22.0, vUv.y * 3.0)), 1.6);
  float breakFace = faceBand * (0.45 + fibre * 1.5) * uGlow;

  vec3 col = wood + uCoreColor * breakFace;

  // 边缘轻微收暗，木段读成有体积的柱体而非贴片。
  float shade = 1.0 - pow(abs(vUv.y - 0.5) * 2.0, 2.6) * 0.42;
  float a = uAlpha * shade;
  // 分离后的木段略微失光（离开被照亮的劈击点）。
  a *= 1.0 - uSplit * 0.18;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * shade, min(1.0, a));
}
`;

/**
 * 斧身：冷钢剪影 + 挥砍时的刃口高光。
 *
 * `uEdge` 由斧刃速率喂入（见 `arcGlow`），所以高光只在斧真的在动时出现，
 * 停住就灭——「斧停了刃还在闪」在物理上说不通。
 */
export const AXE_BLADE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHiColor;
uniform float uAlpha;
uniform float uEdge;
void main() {
  // 斧形：上方是斧头（宽），下方是柄（窄）。
  float headBand = smoothstep(0.52, 0.62, vUv.y);
  float halfWidth = mix(0.09, 0.46, headBand);
  float across = abs(vUv.x - 0.5) * 2.0;
  if (across > halfWidth * 2.0) discard;

  // 刃口在斧头下缘：一条横向亮线。
  float edgeLine = (1.0 - smoothstep(0.0, 0.06, abs(vUv.y - 0.55))) * headBand;
  // 钢的竖向高光带：偏一侧，读出圆弧面。
  float sheen = pow(1.0 - abs(vUv.x - 0.36) * 2.4, 3.0);

  vec3 col = uColor * (0.5 + sheen * 0.8);
  // 挥砍时刃口被自己的弧光照亮。
  col += uHiColor * (edgeLine * (0.4 + uEdge * 1.9) + sheen * uEdge * 0.5);

  float a = uAlpha * (0.82 + edgeLine * 0.18);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, min(1.0, a));
}
`;

/**
 * 落地震荡的地面环波。
 *
 * `uRadius` 与 `uAlpha` 分别喂 `shockRadius` 与 `shockWave`：环一直向外
 * 走而亮度在衰，两者用同一条曲线会让环「涨回去」。
 */
export const AXE_SHOCK_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uTime;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 压扁成地面上的椭圆环（俯视透视的近似）。
  p.y *= 3.1;
  float r = length(p);

  // 环带：宽度随半径增长（波前在扩散中变钝）。
  float band = 0.06 + uRadius * 0.16;
  float ring = 1.0 - smoothstep(0.0, band, abs(r - uRadius));
  // 震尘的不均匀：环不是一条干净的圆。
  float dust = 0.68 + fbm(vec2(atan(p.y, p.x) * 3.4, uTime * 0.8)) * 0.7;

  float a = ring * dust * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.0 + ring * 0.9), min(1.0, a));
}
`;
