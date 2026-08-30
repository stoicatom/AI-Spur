/**
 * 场景 34 revolver 专属 GLSL。
 *
 * 三段都为「短促击发」服务：锥光要在一侧铺满全屏（规格「全屏」），
 * 枪身要读成金属剪影而不是发光贴片，硝烟要是接力上来的一团灰白。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 焰口锥光：从枪口向一侧铺开的光锥（规格「全屏」条目）。
 *
 * uv.x=0 是枪口，1 是屏缘。锥的张角随距离线性张开（真实光锥），
 * 强度按距离平方衰减 —— 近枪口刺白、远处只剩一层薄光。
 */
export const REVOLVER_CONE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uCoreColor;
uniform float uAlpha;
uniform float uReach;
uniform float uTime;
${NOISE_CHUNK}
void main() {
  float along = vUv.x;
  // 锥只铺到 uReach 处：焰弱时光锥短，强时贯穿全屏。
  if (along > uReach) discard;
  float across = abs(vUv.y - 0.5) * 2.0;

  // 张角：枪口处收窄（0.12），远端张满。
  float halfWidth = 0.12 + along * 0.88;
  float edge = across / halfWidth;
  if (edge > 1.0) discard;

  // 横截面：中心亮、边缘羽化。
  float profile = pow(1.0 - edge, 1.7);
  // 距离衰减：平方反比的近似，近枪口过曝。
  float falloff = 1.0 / (1.0 + along * along * 9.0);
  // 火药颗粒的不均匀：光锥里有细密的明暗流纹。
  float grain = 0.72 + fbm(vec2(along * 7.0 - uTime * 2.4, vUv.y * 9.0)) * 0.6;

  float a = profile * falloff * grain * uAlpha;
  if (a < 0.004) discard;
  // 近枪口偏白（高温），远端偏素材色。
  vec3 col = mix(uCoreColor, uColor, clamp(along * 2.2, 0.0, 1.0));
  gl_FragColor = vec4(col * (1.0 + profile * 1.4), min(1.0, a));
}`;

/**
 * 枪身剪影：左轮轮廓 + 转轮圆盘。
 *
 * 用 SDF 拼出「枪管 + 机匣 + 握把」三块，而非贴一张图：轮廓要随
 * uAim 翻转（射击方向可能朝左朝右），贴图做不到镜像还保持光照方向。
 * 转轮的六个弹巢随 uCylinder 转 —— 元素⑦「转轮偏转」的可见载体。
 */
export const REVOLVER_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uHiColor;
uniform float uAlpha;
uniform float uCylinder;
uniform float uFlash;
${NOISE_CHUNK}

// 轴对齐矩形的 SDF（p 相对矩形中心，b 为半尺寸）。
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  // 局部坐标：x 向枪口为正，原点在转轮中心。
  vec2 p = (vUv - vec2(0.42, 0.5)) * vec2(2.0, 2.0);

  // ① 枪管：细长横条，从转轮往枪口伸。
  float barrel = sdBox(p - vec2(0.46, 0.04), vec2(0.42, 0.075));
  // ② 机匣：转轮上方的方块（准星座 + 击锤位）。
  float frame = sdBox(p - vec2(0.02, 0.1), vec2(0.26, 0.17));
  // ③ 握把：往后下方斜出去的一条，用剪切模拟倾角。
  vec2 g = p - vec2(-0.3, -0.34);
  g.x += g.y * 0.42;
  float grip = sdBox(g, vec2(0.13, 0.3));
  // ④ 转轮：圆盘。
  float cyl = length(p - vec2(0.02, 0.0)) - 0.24;

  float body = min(min(barrel, frame), min(grip, cyl));
  if (body > 0.0) discard;

  // 金属高光：上缘亮、下缘暗（顶光），边缘一圈亮线。
  float rim = smoothstep(0.06, 0.0, abs(body));
  float lit = 0.34 + smoothstep(-0.3, 0.35, p.y) * 0.5;
  // 拉丝纹理：金属表面细纹，不是纯色块。
  float brushed = 0.88 + valueNoise(vec2(p.x * 46.0, p.y * 7.0)) * 0.24;

  // 弹巢：六个孔随 uCylinder 转，只在转轮盘面内显示。
  float holes = 0.0;
  if (cyl < 0.0) {
    float ang = atan(p.y, p.x - 0.02) + uCylinder;
    float rr = length(p - vec2(0.02, 0.0));
    // 六等分：把角度折进单个扇区再量到扇区中心线的距离。
    float sector = mod(ang, 3.14159265 / 3.0) - 3.14159265 / 6.0;
    float d = length(vec2(sector * 0.16, rr - 0.145));
    holes = smoothstep(0.055, 0.0, d);
  }

  vec3 col = uColor * lit * brushed;
  col += uHiColor * rim * 0.55;
  // 弹巢是暗孔，但击发瞬间被焰照亮（火光从弹巢缝里透出来）。
  col = mix(col, uHiColor * (0.2 + uFlash * 2.6), holes * 0.85);
  // 整枪被自己的枪口焰照亮一瞬。
  col += uHiColor * uFlash * 0.32;

  gl_FragColor = vec4(col, uAlpha);
}`;

/**
 * 硝烟团：一团灰白的低频翻卷云。
 *
 * 与 VOLUME_CLOUD_FRAGMENT 的分别在于它要**从一点涌出**——用径向的
 * smoothstep 收边并随 uSwell 长大，读起来是烟在扩散而不是一整片云幕。
 */
export const REVOLVER_SMOKE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
uniform float uSwell;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  // 烟团半径随涌出量长大；未起烟时整层不可见。
  float radius = 0.22 + uSwell * 0.78;
  if (r > radius) discard;

  // 双层反向漂移的 FBM：单层平移看着像贴图在滑。
  float base = fbm(p * 1.9 + vec2(uTime * 0.35, -uTime * 0.22));
  float detail = fbm(p * 4.6 - vec2(uTime * 0.18, uTime * 0.31));
  float mass = base * 0.68 + detail * 0.32;

  // 边缘羽化 + 中心稍空（烟圈内部被后续气流吹散）。
  float shell = smoothstep(radius, radius * 0.25, r);
  float puff = smoothstep(0.36, 0.72, mass) * shell;

  float a = puff * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.72 + mass * 0.5), min(1.0, a));
}`;
