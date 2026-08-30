/**
 * 场景 37 bullwhip 的着色片段。
 *
 * 三支各自表达一层物理：音爆环的**双层激波**、声纹的**细环线**、
 * 贴地气流的**涡旋剪切**。
 */

/**
 * ③ 音爆环：内外双层激波。
 *
 * 内环薄而亮（激波面本身），外环宽而淡（被推开的空气）。
 * 两层用同一个 uProgress 推进但半径不同步——外层跑得快，
 * 于是两环之间的间隙随时间张开，像真实的马赫锥截面。
 */
export const SONIC_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uProgress;
uniform float uAlpha;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  // 内层：薄激波面，随进度外扩并变薄（能量摊开在更大的周长上）。
  float rIn = 0.22 + uProgress * 0.52;
  float wIn = 0.075 * (1.0 - uProgress * 0.55);
  float inner = exp(-pow((r - rIn) / max(0.012, wIn), 2.0));
  // 外层：跑得更快、更宽更淡。
  float rOut = 0.22 + uProgress * 0.88;
  float outer = exp(-pow((r - rOut) / 0.15, 2.0)) * 0.42;
  float a = (inner + outer) * uAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(uColor, uCoreColor, clamp(inner * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * (1.0 + inner * 1.8), a);
}`;

/**
 * ⑤ 鞭声纹：多道细环线，等间距向外推。
 *
 * 与音爆环的分野：那是激波实体（两层、有厚度、会变薄），
 * 这是声波的可视化（多道等距细线、厚度恒定），像水面涟漪。
 */
export const WHIP_ACOUSTIC_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uProgress;
uniform float uAlpha;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  // 四道细环：相位沿半径展开，整体随 uProgress 外推。
  float wave = sin((r - uProgress * 1.15) * 26.0);
  float lines = pow(max(0.0, wave), 12.0);
  // 环组只在一个环带内可见（外推时整组淡出）。
  float band = smoothstep(0.0, 0.22, r) * (1.0 - smoothstep(0.55, 1.0, r));
  float a = lines * band * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.6, a);
}`;

/**
 * ⑧ 搅动气流：贴地涡旋。
 *
 * 用极坐标的角向剪切表达：同一半径上的相位随角度线性变化，
 * 半径越小转得越快（涡的角速度随半径衰减），因此纹路是螺旋而非放射。
 */
export const WHIP_VORTEX_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform float uSwirl;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 贴地涡看上去是压扁的椭圆（透视）。
  p.y *= 2.6;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);
  // 内快外慢：相位里的 1/r 项让纹路卷成螺旋。
  float spiral = sin(ang * 3.0 + uSwirl * 6.0 / max(0.18, r) - uTime * 2.4);
  float band = pow(max(0.0, spiral), 3.0);
  float fade = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.0, 0.16, r);
  float a = band * fade * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 1.3, a);
}`;
