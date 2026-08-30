/**
 * 场景 30 aurora 专属 GLSL。
 *
 * 极光带用「沿带的一维参数 + 逐段起伏量」着色，而不是二维噪声贴图：
 * 起伏是编排层用纯函数算出来的行波（见 ./aurora-ribbon），
 * shader 只负责把它渲染成带子——这样「翻卷」既可验收又可见。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/** 与 aurora-ribbon 的 RIBBON_SEGMENTS 保持一致。 */
export const RIBBON_UNIFORM_SEGMENTS = 40;

/**
 * 极光带：绿→紫渐变 + 逐段起伏 + 局部增亮。
 *
 * uFold 是各段的起伏量，uGain 是各段的局部亮度（流光照亮处）。
 * 片元按自己的横向位置取对应段，因此同一条带可以「这段翻上去、
 * 那段翻下去、某段特别亮」。
 */
export const AURORA_RIBBON_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform float uAlpha;
uniform float uTime;
uniform float uSpread;
uniform float uFold[${RIBBON_UNIFORM_SEGMENTS}];
uniform float uGain[${RIBBON_UNIFORM_SEGMENTS}];
uniform float uArch[${RIBBON_UNIFORM_SEGMENTS}];
${NOISE_CHUNK}

/** 取第 i 段与第 i+1 段的线性插值，避免段界出现台阶。 */
float sampleSeg(float arr[${RIBBON_UNIFORM_SEGMENTS}], float u) {
  float f = u * float(${RIBBON_UNIFORM_SEGMENTS} - 1);
  int i0 = int(floor(f));
  int i1 = min(i0 + 1, ${RIBBON_UNIFORM_SEGMENTS} - 1);
  return mix(arr[i0], arr[i1], fract(f));
}

void main() {
  float u = vUv.x;
  // 该段的起伏把带中轴上下推：这就是翻卷。
  float fold = sampleSeg(uFold, u);
  float gain = sampleSeg(uGain, u);

  // 带的中心线 = 中轴弧 + 起伏。中轴弧由 uArch 给（与 TS 侧的
  // ribbonAxisY 同一条曲线），两边不一致会让渲染出的带与验收算出的
  // 位置错位——本项目在 trumpet 的方向增益上踩过这个坑。
  float arch = sampleSeg(uArch, u);
  float center = arch + fold * 0.24;
  float dy = vUv.y - center;

  // 带宽：翻卷剧烈处带子被拉窄（守恒感），且整体由 uSpread 调制。
  float halfWidth = uSpread * (0.16 - abs(fold) * 0.045);
  float across = abs(dy) / max(0.01, halfWidth);
  if (across > 1.0) discard;

  // 横截面：中心亮、边缘羽化成丝。
  float body = pow(1.0 - across, 1.7);
  // 纵向细丝：极光的帘幕结构，高频竖纹。
  float curtain = 0.7 + 0.3 * valueNoise(vec2(u * 92.0, uTime * 0.4));

  // 绿→紫：带底偏绿（氧原子 557.7nm），带顶偏紫（氮离子）。
  float heightMix = clamp(0.5 - dy / max(0.01, halfWidth) * 0.5, 0.0, 1.0);
  vec3 col = mix(uLow, uHigh, heightMix);
  // 局部增亮：流光照亮起伏峰。
  col += uHigh * gain * 0.9;

  float a = body * curtain * uAlpha * (0.72 + gain * 0.6);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, min(1.0, a));
}`;

/**
 * 雪山剪影：底部暗山。
 *
 * 山脊用两层不同频的噪波取脊线，比单层更像连绵山峦。
 */
export const AURORA_MOUNTAIN_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uSnowColor;
uniform float uAlpha;
uniform float uGlow;
${NOISE_CHUNK}
void main() {
  // 山脊高度：两层噪波。
  float ridge = valueNoise(vec2(vUv.x * 3.2, 0.5)) * 0.62
              + valueNoise(vec2(vUv.x * 9.1, 1.7)) * 0.24;
  float skyline = 0.28 + ridge * 0.34;
  if (vUv.y > skyline) discard;

  // 山体近乎全黑（逆光），只有雪顶被极光照亮。
  float nearTop = smoothstep(skyline - 0.06, skyline, vUv.y);
  vec3 col = mix(uColor, uSnowColor, nearTop * (0.25 + uGlow * 0.6));
  gl_FragColor = vec4(col, uAlpha);
}`;

/**
 * 倒影湖面：底部反光带。
 *
 * 倒影必须是**上下翻转**的带面且被水面扰动打散——直接把带子画第二遍
 * 会像贴了两条极光，不像水里的影子。
 */
export const AURORA_LAKE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uLow;
uniform vec3 uHigh;
uniform float uAlpha;
uniform float uTime;
uniform float uFold[${RIBBON_UNIFORM_SEGMENTS}];
${NOISE_CHUNK}
void main() {
  float u = vUv.x;
  float f = u * float(${RIBBON_UNIFORM_SEGMENTS} - 1);
  int i0 = int(floor(f));
  int i1 = min(i0 + 1, ${RIBBON_UNIFORM_SEGMENTS} - 1);
  float fold = mix(uFold[i0], uFold[i1], fract(f));

  // 水面横向扰动：倒影被拉成条纹。
  float ripple = valueNoise(vec2(u * 14.0, vUv.y * 30.0 - uTime * 0.5));
  // 倒影的带心：竖直翻转（1-vUv.y 那侧），并受扰动位移。
  float center = 0.62 - fold * 0.18 + (ripple - 0.5) * 0.06;
  float dy = vUv.y - center;
  float halfWidth = 0.2;
  float across = abs(dy) / halfWidth;
  if (across > 1.0) discard;

  float body = pow(1.0 - across, 2.4);
  // 倒影比本体暗且更绿（水吸收短波）。
  vec3 col = mix(uLow, uHigh, 0.3);
  // 越往下越淡（水深处看不见）。
  float depth = smoothstep(0.0, 0.8, vUv.y);
  float a = body * uAlpha * depth * 0.55;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;
