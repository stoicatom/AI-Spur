/**
 * 场景 15 moon 专属 GLSL。
 *
 * 三段着色都是 moon 独有的：月面环形山、弧形亮带扫掠、冷色月光池。
 * 共用片段（PLANE_VERTEX / NOISE_CHUNK）从 ../cg-shaders 引，不在此重复。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 月面：环形山纹理 + 明暗界线。
 *
 * 环形山用「两层不同频的 valueNoise 取脊线」造，比单层 fbm 更像撞击坑：
 * 脊线（1 - |2n-1|）产生环状边缘，噪波本身只当高低起伏。
 * uPhase 控制升起高度，同时用于压暗下缘（月面刚出地平时下半暗）。
 */
export const MOON_SURFACE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uPhase;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  // 球面法线的 z 分量：让平面贴片有球体的明暗过渡。
  float sphereZ = sqrt(max(0.0, 1.0 - r * r));

  // 环形山：脊线噪波，两层不同尺度叠加。
  float n1 = valueNoise(vUv * 9.0);
  float n2 = valueNoise(vUv * 21.0 + 4.7);
  float ridge = 1.0 - abs(n1 * 2.0 - 1.0);
  float crater = pow(ridge, 3.0) * 0.55 + n2 * 0.18;

  // 月海：低频暗斑，压低反照率。
  float mare = smoothstep(0.35, 0.72, valueNoise(vUv * 3.3 + 1.9));

  float albedo = 0.72 + crater * 0.42 - mare * 0.26;

  // 斜射光：左上打光，配合 sphereZ 给出体积感。
  float lambert = clamp(dot(normalize(vec3(p, sphereZ)), normalize(vec3(-0.45, 0.6, 0.66))), 0.0, 1.0);
  float shade = 0.28 + lambert * 0.82;

  // 升起过程中下缘偏暗，升满后均匀。
  float rise = mix(smoothstep(-1.0, 0.35, p.y), 1.0, uPhase);

  vec3 col = uColor * albedo * shade * rise;
  // 边缘辉光：月晕的内根，与外层月晕环连成一体。
  col += uColor * pow(1.0 - sphereZ, 2.6) * uGlow * 0.9;

  gl_FragColor = vec4(col, rise * (0.92 + uGlow * 0.08));
}`;

/**
 * 月出弧光：一条沿角度扫过的弧形亮带。
 *
 * uSweep 是亮带中心角（弧度），uWidth 是角宽。
 * 用角度差而非 UV 位移，弧带才能贴着环走而不是横向平移。
 */
export const MOON_ARC_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uSweep;
uniform float uWidth;
uniform float uAlpha;
uniform float uRadius;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // 环带径向窗口：只在 uRadius 附近这一圈有亮度。
  float band = exp(-pow((r - uRadius) / 0.085, 2.0));
  if (band < 0.01) discard;

  float ang = atan(p.y, p.x);
  // 角度差取最短弧，避免 ±π 接缝处断裂。
  float d = abs(mod(ang - uSweep + 3.14159265, 6.28318531) - 3.14159265);
  float head = exp(-pow(d / max(0.001, uWidth), 2.0));

  float a = band * head * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.55 + head * 0.9), a);
}`;

/**
 * 地面月光池：冷色椭圆光斑 + 边缘涟漪。
 *
 * 与 lightning 的落雷光池刻意区分：这里没有向外推的涟漪波，
 * 只有随呼吸缓慢起伏的静态冷光，符合「月光洒地」而非「冲击」。
 */
export const MOON_POOL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uBreath;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 纵向压扁：地面透视下月光池是横向椭圆。
  p.y *= 2.4;
  float r = length(p);
  float core = exp(-pow(r / (0.62 + uBreath * 0.07), 2.2));
  float edge = valueNoise(vUv * 6.0) * 0.16;
  float a = clamp((core + core * edge) * uAlpha, 0.0, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + core * 0.6), a);
}`;
