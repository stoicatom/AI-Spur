/**
 * 场景 25 shield 专属 GLSL。
 *
 * 三段各自不可替代：盾面要有**金属纹**（规格元素①明写"圆盾+金属纹"，
 * 拿纯色圆盘顶替就丢了材质身份）；冲击波要是**沿盾缘弹开的弧**而不是
 * 同心圆环（弧的开口方向就是弹开方向，规格互动②的可见载体）；
 * 战损裂纹要**从撞击点长出去**，所以裂纹的极角原点是撞击点而不是盾心。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * 盾面：圆盘 + 放射金属纹 + 同心锻打环 + 受击处余辉。
 *
 * uHitAngle / uHitR 给出撞击点（盾面局部极坐标），余辉与裂纹都以它为
 * 中心——这让"哪里被打到"在画面上真的看得出来。
 */
export const SHIELD_BODY_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uAlpha;
uniform float uGlow;
uniform float uFlash;
uniform float uHitAngle;
uniform float uHitR;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float ang = atan(p.y, p.x);

  // 放射金属纹：24 道锻打棱，靠近盾缘更密（真实圆盾的加强筋走向）。
  float ribs = 0.5 + 0.5 * cos(ang * 24.0);
  // 同心锻打环：金属被锤出的一圈圈台阶。
  float bands = 0.5 + 0.5 * cos(r * 34.0);
  // 表面噪声：让金属不是塑料般均匀。
  float grain = fbm(vec2(ang * 2.4, r * 6.0)) * 0.35;

  // 盾缘包边：外沿一圈更亮的金属唇。
  float rim = smoothstep(0.86, 0.98, r);
  // 盾心凸起（boss）：中央一块更亮的半球。
  float boss = smoothstep(0.22, 0.05, r);

  // 受击处余辉：以撞击点为中心的一团热辐射。
  vec2 hit = vec2(cos(uHitAngle), sin(uHitAngle)) * uHitR;
  float d = length(p - hit);
  float heat = exp(-pow(d / 0.42, 2.0)) * uGlow;

  vec3 col = uColor * (0.55 + ribs * 0.28 + bands * 0.16 + grain);
  col = mix(col, uRimColor, rim * 0.75 + boss * 0.4);
  col += uRimColor * heat * 1.5;
  col += vec3(1.0) * uFlash * 0.55;

  float body = 0.82 + ribs * 0.1 + rim * 0.18;
  float a = uAlpha * body;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, min(1.0, a));
}`;

/**
 * 冲击波：一段**弧**，开口朝弹开方向（不是同心圆环）。
 *
 * uSpanAngle 是弧的半张角，uAimAngle 是弧中心所指方向——场景把它设成
 * 弹开方向的屏幕角。所以"波沿盾缘往来击的反方向铺开"这件事在几何上
 * 成立，而不是靠一层贴片的位置暗示。
 */
export const SHIELD_WAVE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uRadius;
uniform float uThickness;
uniform float uAimAngle;
uniform float uSpanAngle;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // 环带：以 uRadius 为中心的一圈。
  float shell = exp(-pow((r - uRadius) / max(0.001, uThickness), 2.0));
  if (shell < 0.01) discard;

  // 角度窗：只画朝 uAimAngle 的那一段弧，边缘羽化成尖端。
  float da = abs(mod(ang - uAimAngle + 3.14159265, 6.28318531) - 3.14159265);
  float wedge = 1.0 - smoothstep(uSpanAngle * 0.55, uSpanAngle, da);
  if (wedge < 0.01) discard;

  float a = shell * wedge * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.2 + shell * 0.8), min(1.0, a));
}`;

/**
 * 战损裂纹：从撞击点辐射出去的白色裂线。
 *
 * 极角原点取撞击点（uHitAngle/uHitR 换算出的偏移），因此裂纹是"从被
 * 打到的地方裂开"。uReveal 控制裂纹长度，uFlash 控制闪白强度——
 * 场景把 uFlash 与火花发射率喂同一个 impactFlash，这就是互动①的同帧。
 */
export const SHIELD_CRACK_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uFlash;
uniform float uReveal;
uniform float uHitAngle;
uniform float uHitR;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  if (length(p) > 1.0) discard;
  vec2 hit = vec2(cos(uHitAngle), sin(uHitAngle)) * uHitR;
  vec2 q = p - hit;
  float d = length(q);
  float ang = atan(q.y, q.x);

  // 七条主裂：角向的窄峰，noise 让每条粗细不同。
  float spokes = pow(abs(sin(ang * 3.5 + fbm(vec2(ang * 1.7, 0.0)) * 2.2)), 26.0);
  // 长度门：uReveal 控制裂到多远。
  float reach = 1.0 - smoothstep(uReveal * 0.7, uReveal, d);
  float a = spokes * reach * uFlash;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * 2.2, min(1.0, a));
}`;

/**
 * 背光剪影：逆光轮廓——盾外一圈光晕、盾内压暗。
 *
 * 用常规混合（不是叠加）：逆光的本体是"盾把光挡住"，
 * 叠加混合画不出压暗，剪影就没有了。
 */
export const SHIELD_BACKLIGHT_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uLevel;
uniform float uShieldR;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  // 盾轮廓外的光晕：贴着轮廓最亮，往外衰减。
  float halo = exp(-pow(max(0.0, r - uShieldR) / 0.34, 2.0));
  // 轮廓内压暗：逆光下盾体是暗的（剪影）。
  float inside = 1.0 - smoothstep(uShieldR * 0.98, uShieldR, r);
  float a = (halo * 0.7 + inside * 0.45) * uLevel;
  if (a < 0.004) discard;
  vec3 col = mix(uColor * 1.6, vec3(0.02, 0.03, 0.05), inside);
  gl_FragColor = vec4(col, min(1.0, a));
}`;

/** 来击虚影：拉长的菱形 + 速度拖影（高速幻影，规格元素②）。 */
export const SHIELD_STRIKE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSmear;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 菱形：|x|+|y| 的等值线。拖影方向沿 x 被 uSmear 拉长。
  float diamond = abs(p.x) / max(0.2, 1.0 + uSmear * 2.2) + abs(p.y);
  float body = 1.0 - smoothstep(0.55, 1.0, diamond);
  // 尾迹：往 +x 方向（来路）拖出一条渐淡的影。
  float trail = smoothstep(-1.0, 1.0, p.x) * exp(-abs(p.y) * 5.5) * uSmear;
  float a = (body + trail * 0.7) * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (1.4 + body * 0.9), min(1.0, a));
}`;
