/**
 * 场景 29 lotus 专属 GLSL。
 *
 * 三个面：花心莲光（径向层叠辉光）、荷叶浮影（暗叶掩映）、水下光斑
 * （水体折射的焦散网）。都吃一个 uOpen——整朵花的开启度，
 * 让「花开则光起、光起则水面亮」在着色器侧也是同一条因果。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ④莲光：花心发光。
 *
 * 层叠感在着色器里也要成立：辉光不是单一高斯，而是**若干同心亮环**
 * 随 uOpen 逐个推开——与几何层的层叠绽放同构，视觉上读作「一层层
 * 亮起来」而不是一团光在变亮。
 */
export const LOTUS_GLOW_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uOpen;
uniform float uAlpha;
uniform float uTime;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 纵向压扁：俯视水面的透视。
  p.y /= 0.52;
  float r = length(p);
  if (r > 1.0) discard;

  // 花心实光：开得越大，芯越亮越散。
  float core = pow(max(0.0, 1.0 - r), 3.2) * (0.45 + uOpen * 0.9);

  // 层叠亮环：三道环随 uOpen 向外推，靠 uOpen 门控可见性。
  float rings = 0.0;
  for (int i = 0; i < 3; i++) {
    float layer = float(i);
    // 每道环有自己的启动阈值，内环先出——与 TS 侧 layerDelay 同构。
    float gate = clamp((uOpen - layer * 0.22) / 0.3, 0.0, 1.0);
    float ringR = 0.22 + layer * 0.19 + gate * 0.22;
    float band = exp(-pow((r - ringR) / 0.075, 2.0));
    rings += band * gate * (0.5 - layer * 0.1);
  }

  // 极缓的呼吸：莲光不是恒定灯泡。
  float breathe = 0.9 + 0.1 * sin(uTime * 2.1);
  vec3 col = mix(uColor, uCoreColor, core);
  float a = (core + rings) * uAlpha * breathe;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * (0.8 + core * 0.9), min(1.0, a));
}`;

/**
 * ⑥荷叶浮影：暗叶 mesh。
 *
 * 与其它层反向——它是**减光**的（用常规混合压暗水面），
 * 叶脉靠噪声勾出。莲花从叶间探出，暗叶给花体一个衬底。
 */
export const LOTUS_LILYPAD_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uOpen;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  p.y /= 0.42;
  float r = length(p);
  if (r > 1.0) discard;

  float ang = atan(p.y, p.x);
  // 荷叶的缺口：真实荷叶有一道从边缘切到中心的裂口。
  float notch = smoothstep(0.06, 0.16, abs(ang - 2.35));
  // 叶脉：从中心辐射的放射纹，边缘略起皱。
  float veins = 0.55 + 0.45 * sin(ang * 11.0 + r * 2.2);
  float wrinkle = valueNoise(vUv * 7.0 + uTime * 0.05);
  // 边缘卷起：外圈更暗（叶缘翻起挡光）。
  float rim = smoothstep(0.72, 1.0, r);

  float body = smoothstep(1.0, 0.94, r) * notch;
  // 花一开，叶面被莲光照亮一点（同一因果传到暗叶上）。
  float lit = uOpen * 0.22 * (1.0 - r * 0.6);
  float shade = body * (0.62 + veins * 0.16 + wrinkle * 0.12 + rim * 0.3);
  float a = shade * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + lit * 1.6), min(1.0, a));
}`;

/**
 * ⑧水下光斑：底光。
 *
 * 焦散网：两层不同频率的正弦格子相乘得到水面折射的亮斑，
 * 随 uOpen 变亮——花开得越大，透下去的光越多。
 */
export const LOTUS_CAUSTIC_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uOpen;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 两层反向缓慢漂移：单层会显得像贴图在滑。
  vec2 a = uv * 9.0 + vec2(uTime * 0.09, uTime * 0.04);
  vec2 b = uv * 13.0 - vec2(uTime * 0.06, uTime * 0.11);
  // 焦散的特征是尖锐的亮线交织：取绝对值的倒数型峰而非平滑正弦。
  float net = pow(max(0.0, sin(a.x) * sin(a.y)), 3.0)
            + pow(max(0.0, sin(b.x) * sin(b.y)), 4.0) * 0.7;
  float grain = 0.8 + valueNoise(uv * 18.0) * 0.4;

  // 中央更亮：花心正下方是光柱落点。
  vec2 c = (uv - 0.5) * 2.0;
  c.y /= 0.5;
  float pool = pow(max(0.0, 1.0 - length(c)), 1.7);

  float lit = 0.25 + uOpen * 0.95;
  float alpha = (net * 0.5 + pool * 0.5) * grain * uAlpha * lit;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.7 + net * 0.8), min(1.0, alpha));
}`;
