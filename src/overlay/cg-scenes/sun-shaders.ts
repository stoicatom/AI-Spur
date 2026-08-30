/**
 * 场景 16 sun 专属 GLSL。
 *
 * 与 moon 刻意区分：moon 的月面是「静态环形山 + 明暗界线」，
 * sun 的日核是「翻涌对流 + 米粒组织」，同为球体但表面行为相反。
 * 共用片段（PLANE_VERTEX / NOISE_CHUNK）从 ../cg-shaders 引。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 日核：对流层翻涌 + 米粒组织 + 边缘变暗。
 *
 * 三层不同频不同速的噪波叠加造「沸腾」感——单层噪波平移看着像贴图在滑，
 * 反向流动的两层加一层高频细粒才有恒星表面持续翻涌的样子。
 * uChurn 控制翻涌剧烈度（日珥喷发时整体加剧）。
 */
export const SUN_CORE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uTime;
uniform float uChurn;
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;

  float sphereZ = sqrt(max(0.0, 1.0 - r * r));

  // 对流：两层反向漂移 + 一层高频米粒。
  float c1 = fbm(vUv * 4.2 + vec2(uTime * 0.19, -uTime * 0.13));
  float c2 = fbm(vUv * 7.8 - vec2(uTime * 0.11, uTime * 0.17));
  float granule = valueNoise(vUv * 26.0 + uTime * 0.6);
  float churn = (c1 * 0.55 + c2 * 0.45) * (0.72 + uChurn * 0.5) + granule * 0.12;

  // 温度分层：翻涌高处更白热，低处偏橙。
  vec3 col = mix(uColor, uHotColor, clamp(churn * 1.35 - 0.15, 0.0, 1.0));

  // 恒星边缘变暗（limb darkening）：真实恒星盘缘比盘心暗。
  float limb = pow(sphereZ, 0.42);
  col *= 0.55 + limb * 0.75;

  gl_FragColor = vec4(col, uAlpha);
}`;

/**
 * 日冕圈带：多层辉光环，径向衰减 + 角向不均。
 *
 * 与 moon 的月晕（干净同心环）区分：日冕是**有角向结构**的——
 * 某些方位更亮，跟着日珥走。uAsym 提供这个不均匀性。
 */
export const SUN_CORONA_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform float uRadius;
uniform float uAsym;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // 环带窗口：只在 uRadius 附近有亮度，外侧长尾。
  float band = exp(-pow((r - uRadius) / 0.22, 2.0));
  if (band < 0.008) discard;

  float ang = atan(p.y, p.x);
  // 角向不均：低频噪波沿角度采样，日冕才不是均匀圆环。
  float lobes = valueNoise(vec2(ang * 1.6 + uTime * 0.14, uRadius * 3.0));
  float shape = mix(1.0, 0.35 + lobes * 1.3, uAsym);

  float a = band * shape * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.6 + shape * 0.7), a);
}`;

/**
 * 热浪折射：屏幕空间的横向扰动带。
 *
 * 只做亮度扰动不做真实折射——正交相机下叠加层无法采样背景，
 * 用「亮暖条纹随高度扭动」表达空气受热颤动，成本远低于后处理折射。
 */
export const SUN_HAZE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  // 横向拉伸的噪波：竖直方向频率高，横向低，才像上升的热流。
  float warp = fbm(vec2(vUv.x * 2.6, vUv.y * 9.0 - uTime * 0.85));
  float band = smoothstep(0.44, 0.78, warp);
  // 上缘衰减：热浪往上越淡。
  float fade = smoothstep(1.0, 0.15, vUv.y);
  float a = band * fade * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.5 + band * 0.8), a);
}`;
