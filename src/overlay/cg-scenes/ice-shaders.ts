/**
 * 场景 10 ice 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：地面冰裂纹与极光帘只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * 寒雾仍复用工具层的 VOLUME_CLOUD_FRAGMENT——那才是多场景共享的通用件。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ⑤ 地面冰裂纹：裂纹网自爆点沿地面向两侧推进。
 *
 * 用 fbm 的**脊线**（ridge = 1 - |n - 0.5| * 2 再取高次幂）取细线，
 * 而不是画若干条随机线段：真实脆性断裂是应力场的脊，
 * 分叉与合并因此自然出现，手画线段永远像贴图。
 *
 * uSpread 是裂纹前沿（0→1 的横向归一化半径），越界处直接切掉——
 * 这样「裂纹扩散」是前沿在推，不是整张裂纹图一起淡入。
 */
export const ICE_CRACK_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uSpread;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float dist = abs(p.x);

  // 前沿：外侧留一点羽化，裂纹尖端才不是被刀切齐的。
  float front = smoothstep(uSpread + 0.08, uSpread - 0.02, dist);

  // 裂纹网：脊线取细纹，横向频率高于纵向，纹路因此顺着地面走。
  float n = fbm(vec2(p.x * 3.4, p.y * 1.7 + 4.3));
  float ridge = 1.0 - abs(n - 0.5) * 2.0;
  float web = pow(max(0.0, ridge), 20.0);
  // 近爆点纹密而亮，远处只剩零星细缝。
  web *= 0.35 + 0.65 * exp(-pow(dist / 0.55, 2.0));

  // 贯通主缝：沿地面中线的一条主裂，随前沿延伸。
  float seam = exp(-pow(p.y / 0.13, 2.0));

  float a = (web * 0.95 + seam * 0.42) * front * uGlow;
  if (a < 0.005) discard;
  gl_FragColor = vec4(uColor * (1.2 + web * 1.6), min(1.0, a));
}`;

/**
 * ⑧ 极光带：远处微光层。
 *
 * 帘幕的竖纹用 sin 直接给，飘动交给 fbm 推 band 的中心线——
 * 极光的特征是「帘在动、纹不动」，两者拆成两项才不会糊成一片流光。
 */
export const AURORA_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uTime;
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  float wave = fbm(vec2(vUv.x * 2.3 + uTime * 0.045, vUv.y * 1.1));
  float band = exp(-pow((vUv.y - 0.44 - wave * 0.24) / 0.17, 2.0));
  float curtain = 0.5 + 0.5 * sin(vUv.x * 28.0 + wave * 5.5);
  // 帘底压暗、帘顶偏绿白：极光的色分层来自高度，不是随机调色。
  vec3 col = mix(uEdgeColor, uColor, smoothstep(0.2, 0.75, vUv.y));
  float a = band * (0.35 + curtain * 0.65) * uAlpha;
  if (a < 0.005) discard;
  gl_FragColor = vec4(col * 1.45, a * 0.6);
}`;
