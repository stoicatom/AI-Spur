/**
 * 场景 08 skull 专属着色器。
 *
 * 三段 GLSL 都是本场景独有的：裂纹要沿骨面爬升、灰烬环强度由落地数驱动、
 * 冷场是「青灰背光 + 低压地雾」的恐怖底色。共享库里的云幕/透镜都不合用，
 * 因此独立成文件（也为让 cg-skull.ts 守住 250 行上限）。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ① 头骨裂纹：第一幕沿骨面裂开并透出鬼火色。
 *
 * 裂纹用「到多条折线的距离」而不是噪声阈值：噪声出的是斑块，
 * 而规格要的是可辨认的裂缝走向（从顶盖往眼窝方向劈）。
 */
export const CRACK_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uGlow;
uniform float uSpread;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 三条主缝：各自起点不同、走向不同，避免出现对称的装饰纹。
  float seam = 1e3;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float lean = 0.42 + fi * 0.31;
    // 沿 y 抖动的折线：噪声只用来给缝加毛边，不决定缝在哪。
    float wobble = (fbm(vec2(p.y * 2.6 + fi * 7.3, uTime * 0.35)) - 0.5) * 0.34;
    float x = (fi - 1.0) * 0.36 + p.y * lean * 0.5 + wobble;
    seam = min(seam, abs(p.x - x));
  }
  // uSpread 控制裂纹从顶盖向下蔓延的高度，第一幕逐步推进。
  float reach = step(p.y, 1.0) * smoothstep(1.0 - uSpread * 2.0, 1.05 - uSpread * 2.0, -p.y + 1.0);
  float core = 1.0 - smoothstep(0.0, 0.045, seam);
  float halo = 1.0 - smoothstep(0.03, 0.2, seam);
  float a = (core + halo * 0.45) * reach * uGlow;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.4 + core * 2.0), a);
}`;

/**
 * ⑥ 地面灰烬环：环状尘圈，强度与孔洞密度由骨屑落地数（uLandings）驱动。
 *
 * uLandings 是整数计数而非归一化强度：互动②要求灰烬环读的是「几片真落地了」
 * 这一运行时真值，shader 内部再折算成可见量，语义才不会在传递中被抹平。
 */
export const ASH_RING_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uLandings;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  // 环随落地数外扩：先落的骨屑把灰扬近处，落得越多灰圈铺越开。
  float ringR = 0.34 + clamp(uLandings * 0.012, 0.0, 0.4);
  float shell = exp(-pow((r - ringR) / 0.19, 2.0));
  // 尘感靠径向拉伸的噪声，纯环会像个发光圈而不是腾起的灰。
  float angle = atan(p.y, p.x);
  float dust = fbm(vec2(angle * 2.4, r * 5.5 - uTime * 0.5));
  float puff = smoothstep(0.34, 0.78, dust);
  float a = shell * (0.35 + puff * 0.75) * uIntensity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.85 + puff * 0.5), a * 0.72);
}`;

/**
 * ⑦ 月光冷场：青灰背光 + 贴地寒雾，全屏铺开。
 *
 * uTint 独立于素材色：素材色是鬼火的青绿，冷场必须保持月光的青灰，
 * 两者同色会让「冷场」读作鬼火的一部分，恐怖叙事的层次就塌了。
 */
export const MOONLIGHT_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uTint;
uniform float uTime;
uniform float uChill;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 顶部月光渐晕：光从上方压下来，冢地才显得在阴影里。
  float sky = pow(smoothstep(0.15, 1.0, uv.y), 1.6) * 0.5;
  // 四缘压暗：中央留给头骨，暗角是恐怖场景的构图必需。
  float vignette = 1.0 - smoothstep(0.32, 1.02, length((uv - 0.5) * 2.0));
  // 贴地寒雾：缓慢横漂的低层雾带。
  float fog = fbm(vec2(uv.x * 3.2 + uTime * 0.06, uv.y * 6.0 - uTime * 0.02));
  float ground = smoothstep(0.34, 0.0, uv.y) * smoothstep(0.3, 0.75, fog) * 0.6;
  float a = (sky * vignette + ground) * uChill;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uTint, a * 0.6);
}`;
