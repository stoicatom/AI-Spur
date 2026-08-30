/**
 * 场景 21 bell 专属 GLSL。
 *
 * 四段都服务「驻波 + 泛音分层」这条签名：钟体（青铜面 + 铭纹）、
 * 钟面驻波（各分音的环向节径叠加）、泛音光环（每个分音一层，
 * 颜色与衰减各异）、空气波纹（透明同心环）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/** 分音层数：与 BELL_PARTIALS 等长，GLSL 数组尺寸需编译期常量。 */
export const PARTIAL_SLOTS = 5;

/**
 * 钟体轮廓（GLSL 片段，供钟身与驻波层共用）。
 *
 * 归一化 uv 下的钟形：下缘外张的裙摆（钟口）、中段微收的腰、
 * 上方收成穹顶，顶端一段钟纽。轮廓写成函数而不是两层各画一遍，
 * 保证驻波严格贴在钟面上、不会溢出钟体轮廓。
 */
export const BELL_PROFILE_CHUNK = `
// y: 0 = 钟口, 1 = 钟纽顶。返回该高度处的半宽（uv 尺度）。
float bellHalfWidth(float y) {
  if (y > 0.92) return 0.055;                       // 钟纽
  float dome = sqrt(max(0.0, 1.0 - pow(y / 0.94, 2.7)));
  float lip = 1.0 + 0.14 * exp(-y / 0.05);          // 钟口外张的裙摆
  return 0.46 * dome * lip;
}
// 返回 1 表示在钟体内，0 表示在钟体外。
float insideBell(vec2 uv) {
  float y = clamp(uv.y, 0.0, 1.0);
  return step(abs(uv.x - 0.5), bellHalfWidth(y));
}`;

/**
 * ① 钟身：青铜面 + 横向铭纹带 + 钟口加厚。
 *
 * 铭纹是几道等距横带内的高频竖纹（古钟的铭文与乳钉），
 * 用噪声调制避免成为规则条纹。
 */
export const BELL_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uPatina;
uniform float uAlpha;
uniform float uRing;
${NOISE_CHUNK}
${BELL_PROFILE_CHUNK}
void main() {
  vec2 uv = vUv;
  if (insideBell(uv) < 0.5) discard;

  // 圆柱面明暗：正面亮、两侧暗，给出铜体的体积感。
  float lateral = 1.0 - abs(uv.x - 0.5) / max(0.02, bellHalfWidth(uv.y));
  float shade = 0.42 + pow(max(0.0, lateral), 0.7) * 0.78;

  // 铜绿斑驳：低频 FBM 决定哪里氧化。
  float patina = fbm(uv * 3.6);
  vec3 bronze = mix(uColor, uPatina, smoothstep(0.44, 0.78, patina) * 0.55);

  // 铭纹带：三道横带，带内竖向刻痕。
  float bandPhase = fract(uv.y * 3.0 + 0.18);
  float band = smoothstep(0.06, 0.14, bandPhase) * (1.0 - smoothstep(0.24, 0.32, bandPhase));
  float carve = valueNoise(vec2(uv.x * 130.0, floor(uv.y * 3.0) * 9.0));
  bronze = mix(bronze, uColor * 1.45, band * carve * 0.6);

  // 钟口加厚：下缘一圈更亮的唇边。
  float lipEdge = 1.0 - smoothstep(0.0, 0.045, uv.y);
  bronze += uColor * lipEdge * 0.5;

  // 受击时整体被余韵点亮（钟体不是死物，随驻波泛光）。
  bronze *= 1.0 + uRing * 0.5;

  gl_FragColor = vec4(bronze * shade, uAlpha);
}`;

/**
 * ③ 钟波：钟面驻波闪烁。
 *
 * 签名的空间侧：每个分音在钟口圆周上有自己的**节径数** `uMode[i]`，
 * 沿环向呈 cos(mode·φ) 的驻波；节线（cos=0 处）恒不亮。
 * 各层按自身当前幅度 `uAmp[i]` 叠加——因此高分音先熄、
 * 花纹随时间从密变疏，这是「泛音分层」在钟体表面的可见形式。
 *
 * 相位 `uPhase[i]` 由编排层按各分音的角频率推进，保证是驻波
 * （节线不动、只有明暗在原地闪）而不是行波（花纹会滑移）。
 */
export const BELL_STANDING_WAVE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uAlpha;
uniform float uAmp[${PARTIAL_SLOTS}];
uniform float uMode[${PARTIAL_SLOTS}];
uniform float uPhase[${PARTIAL_SLOTS}];
uniform float uFront;
${BELL_PROFILE_CHUNK}
void main() {
  vec2 uv = vUv;
  if (insideBell(uv) < 0.5) discard;

  // 把钟面横向映射成环向角：钟是回转体，uv.x 对应圆周半周。
  float halfW = max(0.02, bellHalfWidth(uv.y));
  float across = clamp((uv.x - 0.5) / halfW, -1.0, 1.0);
  float phi = acos(across);

  // 弯曲波沿钟体从钟口往上传：uFront 是当前波前高度。
  float reach = smoothstep(uFront + 0.16, uFront - 0.04, uv.y);

  float sum = 0.0;
  for (int i = 0; i < ${PARTIAL_SLOTS}; i++) {
    // 驻波：空间项 cos(mode·φ) × 时间项 cos(phase)，节线固定。
    float spatial = cos(uMode[i] * phi);
    sum += uAmp[i] * abs(spatial) * abs(cos(uPhase[i]));
  }

  // 钟口附近振幅最大（自由端），钟顶接近固定端。
  float axial = pow(1.0 - clamp(uv.y, 0.0, 1.0), 0.85);
  float a = sum * axial * reach * uAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(uColor, uHot, clamp(sum * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * (1.0 + sum), min(1.0, a));
}`;

/**
 * ④ 泛音光环：单个分音向空间辐射的波前。
 *
 * 与 guitar 的音浪环刻意不同：这里的环带**内外不对称地拖长**
 * （钟声余韵在波前后方留下一条长尾），且带宽随分音频率变化——
 * 高分音的环更细更锐。能量按 1/r 衰减。
 */
export const BELL_PARTIAL_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
uniform vec2 uOrigin;
void main() {
  float d = distance(vUv, uOrigin);
  float off = d - uRadius;
  // 前沿陡（压缩相），后方拖一条余韵尾。
  float w = off > 0.0 ? uThickness * 0.4 : uThickness * 2.6;
  float band = exp(-pow(off / max(0.003, w), 2.0));
  float spread = 1.0 / (1.0 + uRadius * 3.4);
  float a = band * spread * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.55 + band * 1.15), min(1.0, a));
}`;

/**
 * ⑥ 空气波纹：透明同心环。
 *
 * 与泛音环的区别是**同心多环同时可见**（空气被反复压缩形成的密纹），
 * 且用常规混合而非叠加——它是折射感的透明纹，不是发光体。
 */
export const BELL_AIR_RIPPLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uSpacing;
uniform vec2 uOrigin;
void main() {
  float d = distance(vUv, uOrigin);
  if (d > uRadius) discard;
  // 同心密纹：相位随半径推进，越靠外越疏（波长被拉开）。
  float phase = (d / max(0.01, uSpacing)) - uRadius / max(0.01, uSpacing);
  float rings = pow(max(0.0, cos(phase * 6.2831853)), 3.0);
  // 只在波前内侧一段内可见，中心区域已恢复平静。
  float shell = smoothstep(uRadius * 0.34, uRadius * 0.96, d);
  float a = rings * shell * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, min(0.5, a));
}`;

/**
 * ⑧ 背景庙宇剪影：暗色远景。
 *
 * 只出剪影不出细节：飞檐的斜脊 + 立柱 + 台基，全部压成同一暗色，
 * 保证它永远退在钟体之后，不与主体争亮度。
 */
export const BELL_TEMPLE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uSky;
uniform float uAlpha;
uniform float uGlow;
void main() {
  vec2 uv = vUv;
  // 夜空：上暗下微亮，钟被撞响时天光被泛音染开一层。
  vec3 col = mix(uSky * (1.0 + uGlow * 1.4), uSky * 0.35, smoothstep(0.2, 1.0, uv.y));

  float x = uv.x;
  // 台基
  float podium = step(uv.y, 0.1) * step(0.06, x) * step(x, 0.94);
  // 立柱：等距六根
  float colPhase = abs(fract(x * 6.0) - 0.5);
  float pillars = step(colPhase, 0.14) * step(0.1, uv.y) * step(uv.y, 0.34);
  // 飞檐：两段向外翘起的斜脊
  float roof = step(uv.y, 0.34 + 0.16 * (1.0 - abs(x - 0.5) * 1.9)) * step(0.34, uv.y);
  float eave = step(uv.y, 0.56 + 0.1 * (1.0 - abs(x - 0.5) * 3.1)) * step(0.5, uv.y)
             * step(abs(x - 0.5), 0.3);
  float mass = clamp(podium + pillars + roof + eave, 0.0, 1.0);

  col = mix(col, uColor, mass);
  gl_FragColor = vec4(col, uAlpha * (0.55 + mass * 0.45));
}`;
