/**
 * 场景 03 lightning 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：雨丝增亮与落雷光池只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * 云幕仍复用工具层的 VOLUME_CLOUD_FRAGMENT——那才是多场景共享的通用件。
 */

/**
 * ⑤ 雨幕单条：斜雨。
 *
 * uBright 与 uAlpha 分开两个 uniform，是因为「被电弧照白」既要抬亮度
 * 也要抬色温——只调 material.opacity 只能让雨变浓，不会变白。
 */
export const RAIN_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uBright;
uniform float uAlpha;
void main() {
  // 沿条带纵向做雨丝断续，横向羽化边缘。
  float streak = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float fall = fract(vUv.y * 6.0);
  float drop = smoothstep(0.0, 0.35, fall) * smoothstep(1.0, 0.6, fall);
  vec3 lit = mix(uColor, vec3(1.0), clamp(uBright, 0.0, 1.0) * 0.85);
  float a = streak * drop * uAlpha * (0.35 + uBright * 0.9);
  if (a < 0.004) discard;
  gl_FragColor = vec4(lit, a);
}`;

/**
 * ④ 落雷光池：中心亮、边缘衰减的地面光斑。
 *
 * uRipple 单独一路，让「落雷点亮斑启动光池涟漪」能与主弧劈落对齐，
 * 而不是跟着光池亮度一起淡入淡出。
 */
export const POOL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRipple;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float core = pow(max(0.0, 1.0 - r), 2.2);
  // 涟漪：一圈随进度外扩的环，叠在光池上。
  float ring = smoothstep(0.06, 0.0, abs(r - uRipple)) * (1.0 - uRipple);
  float a = (core * 0.9 + ring * 0.7) * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}`;
