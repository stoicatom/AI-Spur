/**
 * 场景 40 vinyl 的专属着色器。
 *
 * 螺旋槽是本场景的视觉主体，它在片元里按**阿基米德螺线**求值，与
 * `vinyl-groove.ts` 的 `grooveAngleAt` 是同一条曲线的两种表达（一个
 * 给 GPU 画纹路，一个给 CPU 定位光流）。两处若各自写死，光流就会
 * 从槽上滑出去——所以圈数由 uniform 传入而非常量内联。
 */

/** 盘面纹路：黑胶槽的同心螺旋 + 边缘反光。 */
export const VINYL_DISC_FRAGMENT = `
uniform float uTime;
uniform float uAngle;
uniform float uTurns;
uniform float uInner;
uniform float uOuter;
uniform vec3 uSheen;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) { gl_FragColor = vec4(0.0); return; }

  // 盘体：中心标签区亮、槽区深、外缘一圈亮边。
  float label = smoothstep(uInner + 0.04, uInner - 0.02, r);
  float base = mix(0.055, 0.16, label);

  // 螺旋槽：把极角随盘面转角一起旋，槽才跟着唱片转而不是浮在上面。
  float a = atan(p.y, p.x) + uAngle;
  float depth = clamp((uOuter - r) / max(1e-4, uOuter - uInner), 0.0, 1.0);
  float phase = depth * uTurns * 6.2831853 - a;
  float groove = sin(phase) * 0.5 + 0.5;
  float inTrack = step(uInner, r) * step(r, uOuter);
  base += groove * 0.075 * inTrack;

  // 掠射反光带：随盘面转，是「旋转载体」最直观的读数。
  float sweep = cos(a * 2.0 - uTime * 1.4);
  float sheen = pow(max(0.0, sweep), 7.0) * (0.35 + 0.45 * inTrack);

  vec3 col = vec3(base) + uSheen * sheen;
  float edge = smoothstep(1.0, 0.965, r);
  gl_FragColor = vec4(col * edge, edge * 0.97);
}
`;

/** 音轨光流：正在被唱针读取的那一段槽在发亮。 */
export const VINYL_TRACK_FRAGMENT = `
uniform float uRadius;
uniform float uGlow;
uniform float uAngle;
uniform float uTurns;
uniform float uInner;
uniform float uOuter;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  if (uGlow <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);

  // 只在针所在半径的一圈邻域内发亮：光流锚在针尖，不是整盘泛光。
  float band = exp(-pow((r - uRadius) / 0.035, 2.0));

  // 沿槽的行波：相位与盘面转角同源，光沿槽流动而非闪烁。
  float a = atan(p.y, p.x) + uAngle;
  float depth = clamp((uOuter - r) / max(1e-4, uOuter - uInner), 0.0, 1.0);
  float phase = depth * uTurns * 6.2831853 - a;
  float wave = pow(sin(phase) * 0.5 + 0.5, 3.0);

  float inTrack = step(uInner, r) * step(r, uOuter);
  float amp = band * (0.35 + wave * 0.65) * uGlow * inTrack;
  gl_FragColor = vec4(uColor * amp, amp * 0.9);
}
`;

/** 转速视觉：随角速度增强的径向拖影，快时糊、停时清。 */
export const VINYL_SPIN_FRAGMENT = `
uniform float uOmega;
uniform float uAngle;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  if (uOmega <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) { gl_FragColor = vec4(0.0); return; }

  // 切向拉长的条纹：条纹数固定，靠强度随转速变化表达「转得快」。
  float a = atan(p.y, p.x) + uAngle;
  float streak = pow(max(0.0, sin(a * 6.0)), 12.0);
  // 外圈线速度大、拖影重，与刚体运动学一致。
  float amp = streak * uOmega * r * 0.055 * smoothstep(1.0, 0.7, r);
  gl_FragColor = vec4(uColor * amp, amp);
}
`;

/** 灯语：舞台侧光在盘面上的一道扫掠光带。 */
export const VINYL_LAMP_FRAGMENT = `
uniform float uTime;
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 斜向光带缓慢横移，给静态构图一点空气流动。
  float band = sin((p.x * 0.7 + p.y * 0.4) * 2.6 - uTime * 0.85);
  float amp = pow(max(0.0, band), 5.0) * uIntensity;
  float vignette = smoothstep(1.5, 0.2, length(p));
  amp *= vignette;
  gl_FragColor = vec4(uColor * amp, amp * 0.72);
}
`;
