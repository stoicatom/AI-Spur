/**
 * 场景 17 meteor 专属 GLSL。
 *
 * 三段都是「大气再入」独有的热力学表现：迎风面高温梯度的火鞘、
 * 超音速锥的马赫面、电离尾迹的分段衰减。与 comet 的彗尾（真空中
 * 无激波、无迎风面）在着色上就区分开。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 火鞘：迎风面白热、背风面拉长的高温包层。
 *
 * 关键是**非对称**：真实再入体的热流集中在迎风驻点，尾部是低压尾流。
 * 用 uv.x 做迎风轴，前缘窄而白、后缘宽而暗。
 */
export const METEOR_SHELL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uTime;
uniform float uHeat;
uniform float uAlpha;
${NOISE_CHUNK}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 迎风方向为 +x：前缘压扁（激波压缩），后缘拉长（尾流）。
  float front = max(0.0, p.x);
  float back = max(0.0, -p.x);
  vec2 q = vec2(p.x * (1.0 + back * 1.6), p.y * (1.6 - front * 0.5));
  float r = length(q);
  if (r > 1.0) discard;

  // 湍流：沿迎风轴流动的高频噪波，越往后越乱。
  float turb = fbm(vec2(vUv.x * 5.0 - uTime * 1.9, vUv.y * 7.0 + uTime * 0.4));
  float mass = (1.0 - r) * (0.7 + turb * 0.6);

  // 温度：驻点最白热，向后迅速转橙。
  float temp = clamp(front * 1.5 + mass * 0.5, 0.0, 1.0) * uHeat;
  vec3 col = mix(uColor, uHotColor, temp);

  float a = mass * uAlpha;
  if (a < 0.006) discard;
  gl_FragColor = vec4(col * (0.6 + temp * 0.9), a);
}`;

/**
 * 音爆锥：超音速激波的马赫锥。
 *
 * 锥面是一条随速度收窄的直线边界（马赫角 = asin(1/M)），
 * 所以 uMach 越大锥越尖。锥面本身亮、内部近乎透明——
 * 这是激波「面」而非「体」的关键。
 */
export const METEOR_MACH_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uMach;
uniform float uAlpha;
void main() {
  // 锥顶在右缘中点，向左张开。
  vec2 p = vec2(1.0 - vUv.x, (vUv.y - 0.5) * 2.0);
  if (p.x <= 0.0) discard;

  // 马赫角：uMach 越大越尖。半张角的 tan。
  float halfAngle = 1.0 / max(1.05, uMach);
  // 到锥面的距离：|y| 与 x*tan(角) 的差。
  float edge = abs(p.y) - p.x * halfAngle;
  // 只在锥面附近一薄层有亮度（激波是面）。
  float shell = exp(-pow(edge / 0.055, 2.0));
  // 锥顶最亮，往后衰减。
  float falloff = exp(-p.x * 1.4);

  float a = shell * falloff * uAlpha;
  if (a < 0.005) discard;
  gl_FragColor = vec4(uColor * (0.7 + shell * 0.8), a);
}`;

/**
 * 电离尾迹：沿轨迹的分段衰减亮带。
 *
 * 与 comet 的彗尾区分：电离尾迹**有分段结构**（等离子体团在
 * 复合过程中断续发光），而彗尾是连续的。uBreak 控制分段深度。
 */
export const METEOR_TRAIL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform float uBreak;
${NOISE_CHUNK}
void main() {
  // 沿 x 为轨迹方向，头部（x=1）最亮。
  float along = vUv.x;
  float across = abs(vUv.y - 0.5) * 2.0;
  // 横截面：中心亮、边缘羽化，且越往尾部越宽。
  float width = 0.35 + (1.0 - along) * 0.55;
  float core = exp(-pow(across / width, 2.0));
  // 纵向衰减：头亮尾淡。
  float decay = pow(along, 1.6);
  // 分段：低频噪波沿轨迹切出明暗团块。
  float seg = valueNoise(vec2(along * 9.0 - uTime * 0.7, 3.1));
  float segment = mix(1.0, 0.25 + seg * 1.35, uBreak);

  float a = core * decay * segment * uAlpha;
  if (a < 0.005) discard;
  gl_FragColor = vec4(uColor * (0.65 + decay * 0.8), a);
}`;
