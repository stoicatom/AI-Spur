/**
 * 场景 14 star 专属 GLSL。
 *
 * 三段都只服务本场景：五芒星体（真 SDF 星形，不是贴一张圆）、
 * 星轨光带（沿轴的锥形拖尾）、环状波（贴面波前）。
 * 共用片段（PLANE_VERTEX / NOISE_CHUNK）从 ../cg-shaders 引，不在此重复。
 */

/**
 * 五芒星体：iq 的 star5 SDF + 内核辉光。
 *
 * 用 SDF 而不是贴图，是因为「五轴对称」是本场景的签名：星体的五个尖角
 * 必须与五条星轨严格同角（都由 72° 等分导出），贴图会让两者各说各话。
 * uCharge 是凝聚度（第一幕 0→1），uSpin 是自转角。
 */
export const STAR_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uAlpha;
uniform float uCharge;
uniform float uSpin;

// iq: signed distance to a 5-pointed star. r 外接半径，rf 内外径比。
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float c = cos(uSpin);
  float s = sin(uSpin);
  p = mat2(c, -s, s, c) * p;

  // 凝聚：星体半径从一个亮点长到满尺寸，尖角同步变尖。
  float radius = mix(0.16, 0.74, uCharge);
  float d = sdStar5(p, radius, 0.42);

  // 实心（d<0）+ 外缘辉光（d>0 指数衰减）。
  float solid = 1.0 - smoothstep(-0.02, 0.02, d);
  float halo = exp(-max(0.0, d) * 7.5);
  float a = (solid + halo * 0.75) * uAlpha;
  if (a < 0.004) discard;

  // 星心更白：能量集中在几何中心。
  vec3 col = mix(uColor, uCoreColor, solid * (1.0 - smoothstep(0.0, 0.55, length(p))));
  gl_FragColor = vec4(col * (1.0 + solid * 0.9), min(1.0, a));
}`;

/**
 * 星轨光带：沿贴片 +y 方向的锥形拖尾。
 *
 * 根部宽而亮、顶端收细并留一个亮点（顶点就是剥落小星点的位置）。
 * uHead 是顶端亮度，uAlpha 是整条轨的可见度。
 */
export const STAR_RAY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHeadColor;
uniform float uAlpha;
uniform float uHead;
void main() {
  // v: 0 在根部（星心），1 在顶端。
  float v = vUv.y;
  float lateral = abs(vUv.x - 0.5) * 2.0;
  // 锥形收束：越靠顶端允许的横向越窄。
  float width = mix(1.0, 0.16, pow(v, 0.7));
  float band = 1.0 - smoothstep(width * 0.35, width, lateral);
  // 沿轨衰减 + 顶端亮点。
  float along = pow(1.0 - v, 0.85);
  float head = exp(-pow((v - 0.94) / 0.05, 2.0)) * uHead;
  float a = (band * along * 0.9 + band * head) * uAlpha;
  if (a < 0.004) discard;
  vec3 col = mix(uColor, uHeadColor, clamp(head * 1.4, 0.0, 1.0));
  gl_FragColor = vec4(col * (1.0 + head * 1.6), min(1.0, a));
}`;

/**
 * 环状波：以星心为圆心的横向波前。
 *
 * uRadius 是当前半径（贴片 UV 尺度），由编排层按 hoopRadius 纯函数写入
 * ——半径是时间的函数而非常量，互动②「环波推散星屑」才有因果可言。
 * 波前压扁成横向椭圆（uSquash），读作「横向环」而非同心圆。
 */
export const STAR_HOOP_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
uniform float uSquash;
void main() {
  vec2 p = vUv - 0.5;
  p.y /= max(0.08, uSquash);
  float d = length(p);
  float off = d - uRadius;
  // 前沿陡、后沿拖长：波前的压缩相在外侧。
  float w = off > 0.0 ? uThickness * 0.4 : uThickness;
  float band = exp(-pow(off / max(0.003, w), 2.0));
  // 能量随半径摊薄。
  float spread = 1.0 / (1.0 + uRadius * 5.0);
  float a = band * spread * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + band * 1.1), min(1.0, a));
}`;

/**
 * 光晕层：以星心为中心的径向辉光。
 *
 * 多层叠加靠 uFalloff 区分：内层陡（紧贴星体的白核），外层缓（弥散大晕）。
 * 单层用「指数衰减 + 一圈更亮的软边」而不是纯高斯，避免多层叠出来是一坨糊光。
 */
export const STAR_HALO_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uFalloff;
uniform float uRim;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  if (r > 1.0) discard;
  float core = exp(-pow(r / max(0.04, uFalloff), 2.0));
  float rim = exp(-pow((r - uRim) / 0.14, 2.0)) * 0.45;
  float a = (core + rim) * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.8 + core * 1.4), min(1.0, a));
}`;
