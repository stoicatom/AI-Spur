/**
 * 场景 36 boxing-glove 专属 GLSL。
 *
 * 四段各自不可替代：拳套要有**皮革分瓣**（规格元素①明写「红拳套」，
 * 拿纯色椭圆顶替就丢了材质身份，也看不出压缩形变作用在哪个方向）；
 * 压缩环要是**空气被压出的密度环**而非发光圆环——它的亮度在环带内侧
 * 更高（迎着拳的那一面被压得更实），这是「命中空气」的可见证据；
 * 沙袋是**远端虚影**，必须比拳套糊一个量级，否则观众会以为拳打的是它。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 拳套：皮革本体 + 分瓣缝线 + 指节隆起 + 腕带。
 *
 * uSquash 沿拳路方向压扁（本贴片的局部 x 即拳路方向），所以形变是
 * 「迎击面被压实」而不是整体缩小——后者看起来像拳套飞远了。
 */
export const GLOVE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uAlpha;
uniform float uSquash;
uniform float uFlash;
${NOISE_CHUNK}
void main() {
  // 沿拳路压扁：uSquash < 1 时 x 方向被压实，形状仍然充满贴片。
  vec2 p = (vUv - 0.5) * 2.0;
  p.x /= max(0.35, uSquash);

  // 拳套轮廓：椭圆主体（拳面朝 +x）+ 拇指瓣。
  float body = length(vec2(p.x * 0.86, p.y)) ;
  float thumb = length(vec2((p.x + 0.34) * 1.5, (p.y + 0.52) * 1.15));
  float d = min(body, thumb);
  if (d > 1.0) discard;

  // 皮革粒面：细噪声，让红皮不是塑料。
  float grain = fbm(p * 5.2) * 0.28;
  // 指节隆起：三道横向鼓包，拳面处最明显。
  float knuckle = 0.5 + 0.5 * cos(p.y * 8.4);
  knuckle *= smoothstep(-0.2, 0.9, p.x);
  // 分瓣缝线：沿拳面的一道弧缝 + 拇指瓣分界。
  float seam = smoothstep(0.045, 0.0, abs(length(vec2(p.x * 0.86, p.y)) - 0.62));
  float thumbSeam = smoothstep(0.05, 0.0, abs(thumb - 0.96)) * step(-0.05, -p.x + 0.4);

  // 受光：拳面（+x）与上缘更亮，背面入暗——正交相机下唯一的体积线索。
  float lit = 0.42 + 0.58 * smoothstep(-0.8, 1.0, p.x * 0.7 + p.y * 0.5);

  vec3 col = uColor * (lit + grain + knuckle * 0.16);
  col += uRimColor * (seam * 0.5 + thumbSeam * 0.4);
  // 命中白闪：整只拳套被压缩瞬间的高光糊住。
  col += vec3(1.0) * uFlash * 0.75;

  // 边缘羽化，避免正交相机下的硬锯齿。
  float edge = smoothstep(1.0, 0.86, d);
  gl_FragColor = vec4(col, uAlpha * edge);
}
`;

/**
 * 压缩环：空气密度环。
 *
 * 关键在**内外不对称**：环带迎着拳的那一侧（内缘）更亮更实，背面拖出
 * 稀疏的尾。一圈亮度均匀的环画出来是「魔法特效」，不是被压缩的空气。
 * uRadius 是归一化半径（1 = 贴片边缘 = 屏缘）。
 */
export const COMPRESSION_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // 环带：以 uRadius 为中心的高斯带。
  float band = exp(-pow((r - uRadius) / max(0.004, uThickness), 2.0));
  // 内外不对称：内缘（r < uRadius）压得更实，外缘迅速稀薄。
  float inner = smoothstep(uRadius + uThickness * 0.4, uRadius - uThickness, r);
  band *= 0.55 + 0.75 * inner;
  // 密度不均：空气被压缩时形成絮状纹，环因此不是完美圆。
  float wisp = 0.72 + 0.42 * fbm(vec2(ang * 3.6, uRadius * 5.0));
  band *= wisp;

  gl_FragColor = vec4(uColor * band, uAlpha * band);
}
`;

/**
 * 命中白闪：中心过曝的一团，带放射条。
 *
 * 放射条数为质数（13），避免与压缩环的絮状纹（3.6 周期）拍频对齐后
 * 在画面上形成规则花瓣。
 */
export const HIT_FLASH_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uLevel;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  // 核心过曝团。
  float core = exp(-r * r * 7.0);
  // 放射条：命中瞬间的光针。
  float rays = pow(max(0.0, 0.5 + 0.5 * cos(ang * 13.0)), 5.0) * exp(-r * 2.6);
  float v = (core + rays * 0.55) * uLevel;
  gl_FragColor = vec4(uColor * v + vec3(v * 0.6), v);
}
`;

/**
 * 沙袋虚影：远端景深外的摆动柱体。
 *
 * 刻意做糊：边缘羽化宽达 0.3，内部只有纵向条纹暗示帆布。它必须一眼
 * 就是「背景里的另一个物件」，否则「本场景没有被击目标」这个签名
 * 在画面上会被误读。
 */
export const SANDBAG_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 圆角柱体：上下收口的胶囊。
  float body = max(abs(p.x) * 1.35, abs(p.y) * 0.82);
  float mask = smoothstep(1.0, 0.7, body);
  // 帆布纵纹 + 缝合带。
  float canvas = 0.78 + 0.22 * cos(p.x * 22.0);
  float strap = smoothstep(0.06, 0.0, abs(fract(p.y * 1.6 + 0.5) - 0.5) - 0.06);
  // 受光：左上受光，右下入暗。
  float lit = 0.5 + 0.5 * smoothstep(-1.0, 1.0, -p.x * 0.6 - p.y * 0.4);
  vec3 col = uColor * (lit * canvas + strap * 0.18);
  gl_FragColor = vec4(col, uAlpha * mask * 0.72);
}
`;
