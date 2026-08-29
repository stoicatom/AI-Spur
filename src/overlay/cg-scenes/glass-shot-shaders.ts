/**
 * 场景 35 glass-shot 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：玻璃介质与蛛网裂纹只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ② 玻璃板：靠两条斜向镜面反光带被看见，本体几乎全透。
 *
 * uShatter 推进时 fbm 阈值下移，玻璃按噪声块状消失——
 * 剥落是「面积丢失」而不是整块淡出，才像碎片被抽走后留下的空洞。
 */
export const GLASS_PANE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uTint;
uniform float uShatter;
uniform float uSheen;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float sheen = exp(-pow((p.x * 0.62 + p.y - 0.2) / 0.5, 2.0)) * 0.55
              + exp(-pow((p.x * 0.62 + p.y + 0.66) / 0.26, 2.0)) * 0.24;
  sheen *= uSheen;
  float loss = smoothstep(0.42, 1.0, fbm(vUv * 5.5) + uShatter * 0.9);
  float a = (0.085 + sheen) * (1.0 - loss);
  if (a < 0.006) discard;
  gl_FragColor = vec4(uTint * (0.55 + sheen * 1.9), a);
}`;

/**
 * ④ 蛛网裂纹细纹层：径向 + 环向两组参数共同定形。
 *
 * 关键在于两组都以冲击点为心：真玻璃的裂纹是应力场的解，
 * 主裂纹沿半径撕开、环纹沿等应力圈闭合，所以绝不是随机线段。
 * uFront 是裂纹前沿半径，越界的部分还没裂到，直接被切掉。
 */
export const GLASS_CRACK_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uRadialCount;
uniform float uRingCount;
uniform float uFront;
uniform float uHole;
uniform float uFine;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);
  float seg = 6.2831853 / max(1.0, uRadialCount);

  // 每条主裂纹带独立角度抖动：等分角会露出「尺规画的」机械感。
  float idx = floor((ang + 3.14159265) / seg);
  float jitter = (hash12(vec2(idx, 3.7)) - 0.5) * seg * 0.45;
  float d = abs(mod(ang - jitter + 3.14159265, seg) - seg * 0.5);
  float radial = exp(-pow(d * max(r, 0.04) / 0.013, 2.0));

  // 环向裂纹：半径不等距，间距随机才像应力逐圈释放。
  float ring = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= uRingCount) break;
    float rr = 0.15 + fi * 0.17 + hash12(vec2(fi, 8.1)) * 0.06;
    ring += exp(-pow((r - rr) / 0.011, 2.0));
  }

  // 细纹只长在主裂纹与环纹的夹缝，且越靠外越稀。
  float fine = smoothstep(0.58, 1.0, fbm(p * 9.5)) * uFine * smoothstep(1.0, 0.15, r);

  float front = smoothstep(uFront + 0.07, uFront - 0.03, r);
  float hole = smoothstep(uHole * 0.17, 0.0, r) * uHole;
  float a = (radial + ring * 0.7 + fine * 0.55) * front + hole * 0.8;
  if (a < 0.006) discard;
  gl_FragColor = vec4(uColor * 1.7 + vec3(hole * 0.9), min(1.0, a) * 0.9);
}`;

/**
 * ① 弹道热浪：弹头后方的空气受热扰动，随进度往后拖长。
 * 与曳光实体分层，热浪才能比弹头更宽更虚。
 */
export const TRACER_HEAT_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uProgress;
uniform float uIntensity;
${NOISE_CHUNK}
void main() {
  float tail = smoothstep(0.0, 0.55, vUv.x);
  float core = exp(-pow((vUv.y - 0.5) / 0.19, 2.0));
  float shimmer = 0.65 + 0.35 * fbm(vec2(vUv.x * 12.0 - uProgress * 9.0, vUv.y * 6.0));
  float a = tail * core * shimmer * uIntensity;
  if (a < 0.006) discard;
  gl_FragColor = vec4(uColor * 1.5, a * 0.7);
}`;
