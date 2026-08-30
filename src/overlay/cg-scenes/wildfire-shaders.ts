/**
 * 场景 33 wildfire 的 GLSL。
 *
 * 与 flame 的 shader 刻意不同构：那边是**一片驻留的火舌**（噪声沿 -y
 * 平流，贴片中心不动），这边所有涉及火的层都吃一个 `uFront` uniform
 * ——火只在火线**附近**存在，火线左侧是焦土、右侧是未燃的草。
 * 「二维推进」因此在画面上也成立，而不只是 TS 侧的数字在动。
 *
 * 草地层的 `uBurned` 与 TS 侧 `charLevel` 同源：同一条曲线两处实现，
 * 参数必须一致。本项目 trumpet/aurora 踩过「测的曲线与画的曲线不是
 * 同一条」——断言全绿而观感错误。改任一侧都要同步另一侧。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ② 草地层：火线扫过后由绿转焦黑。
 *
 * `uFront` 是火线的归一化横坐标（uv 空间 0–1）。判据是**逐像素比较自己
 * 的 x 与火线位置**——不是整层统一变暗。这让「已烧/未烧」在同一帧内
 * 沿横向分出两个区域，正是二维蔓延的画面证据。
 *
 * 焦黑一旦形成不再恢复：片元只看 `uFront` 是否已越过自己，而 `uFront`
 * 单调推进（TS 侧 `spreadProgress` 保证），所以不可逆性由上游给定。
 */
export const WILDFIRE_GRASS_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uGrassColor;
uniform vec3 uCharColor;
uniform float uFront;    // 火线归一化横坐标（0–1）
uniform float uAlpha;
uniform float uCharSpan; // 炭化过渡带宽度（uv）
${NOISE_CHUNK}
void main() {
  // 草叶纹理：竖向拉长的噪声，读作一片草而非一块色板。
  float blade = valueNoise(vec2(vUv.x * 120.0, vUv.y * 14.0));
  float tuft = valueNoise(vec2(vUv.x * 38.0, vUv.y * 6.0));

  // 逐像素判定自己是否已被火线越过。过渡带内是正在烧的焦边。
  float burned = smoothstep(uFront + uCharSpan, uFront - uCharSpan, vUv.x);
  vec3 col = mix(uGrassColor, uCharColor, burned);
  // 焦土上还有零星未烧尽的亮点（暗红余烬的底色）。
  col += vec3(0.28, 0.07, 0.0) * burned * step(0.82, blade);

  // 草地在近处（下方）更密更暗，远处（上方）淡出。
  float depth = smoothstep(1.0, 0.15, vUv.y);
  float a = uAlpha * depth * (0.6 + tuft * 0.55);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * (0.7 + blade * 0.5), a);
}`;

/**
 * ① 火线蔓延：沿地面横向铺开的一条火带。
 *
 * 与 flame 的火舌根本不同：那边是**一个位置**的连续流，这边是一条
 * **有头有尾的带**——`uFront` 处最旺，往左（已烧过）迅速减弱成余烬，
 * 往右（未燃）完全为零。火线的头部边缘是最亮的一条锋线。
 */
export const WILDFIRE_FRONT_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uFront;   // 火线归一化横坐标（0–1）
uniform float uTime;
uniform float uAlpha;
uniform float uLean;    // 火舌倾角（弧度，风助）
uniform float uWidth;   // 火线纵深（uv）
${NOISE_CHUNK}
void main() {
  // 火舌随风倾斜：越往上偏移越大（顶端被风吹得最远）。
  float x = vUv.x - uLean * vUv.y * 0.42;
  // 距火线的有向距离：正 = 火线后方（已烧），负 = 前方（未燃）。
  float behind = uFront - x;

  // 未燃区严格为零——火不会出现在火线前面。
  if (behind < -0.01) discard;

  // 锋线最旺，往后按纵深衰减成将熄的火。
  float band = exp(-max(behind, 0.0) / max(uWidth, 0.001));
  // 火焰高度随噪声起伏：火线不是一条平齐的墙。
  float flick = fbm(vec2(x * 14.0, vUv.y * 3.2 - uTime * 2.1));
  float height = (0.34 + flick * 0.5) * band;
  if (vUv.y > height) discard;

  float hn = vUv.y / max(height, 0.001);
  // 根部亮芯、顶端偏橙红。
  vec3 col = mix(uCoreColor, uColor, hn);
  float a = band * uAlpha * (1.0 - hn * 0.55) * (0.62 + flick * 0.5);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/**
 * ④ 热浪扭曲：火线上方的空气抖动。
 *
 * 与 flame 的热浪（集中在**一根**火柱上方）不同：这里的热浪跟着火线
 * 走，只在 `uFront` 附近一带出现——所以它自己也在横向移动。
 */
export const WILDFIRE_HEAT_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uFront;
uniform float uTime;
uniform float uStrength;
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  float n = fbm(vec2(vUv.x * 11.0, vUv.y * 2.8 - uTime * 1.7));
  float n2 = fbm(vec2(vUv.x * 21.0 + 4.3, vUv.y * 4.6 - uTime * 2.4));
  float ripple = (n - 0.5) * 0.62 + (n2 - 0.5) * 0.38;

  // 只在火线附近一带：热源是火线本身，随它一起横移。
  float nearFront = smoothstep(0.34, 0.02, abs(vUv.x - uFront));
  float rise = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.38, vUv.y);
  float a = abs(ripple) * nearFront * rise * uStrength * uAlpha * 2.4;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/**
 * ⑤ 烟柱：火线上方斜升的浓烟。
 *
 * 被风吹斜（`uLean` 与火舌倾角同源），越高越淡越散。烟柱的根部锚在
 * 火线上，所以它也随火线横移——这一层跟着走，是「火势整体在推进」
 * 而非「某处火焰变亮」的又一处画面证据。
 */
export const WILDFIRE_SMOKE_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uHeight;  // 烟柱高度（0–1）
uniform float uLean;    // 风致倾角
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  // 被风吹斜：越高偏得越多。
  float x = vUv.x - uLean * vUv.y * 0.9;
  // 双层反向漂移：单层平移会读成贴图在滑，两层交错才有翻腾感。
  float base = fbm(vec2(x * 3.4, vUv.y * 2.2 - uTime * 0.5));
  float detail = fbm(vec2(x * 7.8 + 2.1, vUv.y * 4.4 - uTime * 0.8));
  float mass = base * 0.66 + detail * 0.34;

  if (vUv.y > uHeight) discard;
  // 柱心浓、边缘散；越高越宽（烟在上升中扩散）。
  float spread = 0.12 + vUv.y * 0.4;
  float column = smoothstep(spread, 0.0, abs(x - 0.5));
  float fade = 1.0 - vUv.y / max(uHeight, 0.001) * 0.75;
  float a = smoothstep(0.36, 0.8, mass) * column * fade * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.8 + mass * 0.4), a);
}`;
