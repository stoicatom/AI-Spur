/**
 * 场景 01 rocket 专属着色器。
 *
 * 没有并进 cg-shaders 工具层：烟柱的「蘑菇帽」与地平线晨曦线只有本场景用得上，
 * 放进共享库会让「工具层只放通用件」的边界糊掉（设计规格 §4.1 规则 2）。
 * 噪声仍复用工具层的 NOISE_CHUNK——那才是多场景共享的通用件。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/**
 * ② 尾烟单侧柱：FBM 灰烟 + 体积膨胀 + 音爆环推出的蘑菇帽。
 *
 * uCap 单独一路而不复用 uDensity：帽檐是「被音爆环推开」的结果，
 * 必须能在烟量不变的前提下单独张开，两者混成一个 uniform 就表达不了互动。
 * uRise 也独立于 uTime：升速要能递减，跟着 uTime 走只会是匀速上滑。
 */
export const SMOKE_COLUMN_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uDensity;
uniform float uRise;
uniform float uCap;
${NOISE_CHUNK}
void main() {
  vec2 uv = vUv;
  // 柱体轮廓：底部收窄（贴住喷口），上段外扩——这就是「体积膨胀」的剖面。
  float grow = mix(0.24, 0.44, smoothstep(0.0, 0.86, uv.y));
  // 蘑菇帽：只在顶段生效，越被推开越向外翻出帽檐。
  float brim = smoothstep(0.56, 0.94, uv.y) * uCap;
  float radius = grow + brim * 0.4;
  float dx = abs(uv.x - 0.5);
  float body = 1.0 - smoothstep(radius * 0.6, radius, dx);
  // 双层反向漂移，uRise 只推低频层：单层平移会显得像贴图在滑。
  float base = fbm(uv * 3.0 + vec2(uTime * 0.05, -uRise));
  float detail = fbm(uv * 7.6 - vec2(uTime * 0.037, uTime * 0.021));
  float mass = base * 0.66 + detail * 0.34;
  float smoke = smoothstep(0.4, 0.84, mass) * body * uDensity;
  // 顶端羽化，避免柱子被平面上缘切平；张开帽檐后收敛羽化以保住帽形。
  smoke *= 1.0 - smoothstep(0.8, 1.0, uv.y) * (1.0 - uCap * 0.55);
  if (smoke < 0.004) discard;
  gl_FragColor = vec4(uColor, smoke);
}`;

/**
 * ⑥ 地平线光带：晨曦线。
 *
 * 亮线与上方辉光分成两项相加，是因为「整体增辉」要的是辉光面积随引擎亮度扩张，
 * 而线本身粗细基本不变——一项高斯做不到这两种响应。
 * 横向再乘一个中轴高斯：地平线是被发射点照亮的，不是自发光灯管。
 */
export const HORIZON_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uDawn;
uniform float uGlow;
uniform float uTime;
void main() {
  float d = abs(vUv.y - 0.5) * 2.0;
  float line = exp(-pow(d / 0.09, 2.0));
  // 辉光只朝上（uv.y > 0.5 一侧），地表以下不该发亮。
  float halo = pow(max(0.0, 1.0 - d), 3.0) * step(0.5, vUv.y) * (0.6 + uGlow * 0.7);
  float axis = 0.5 + 0.5 * exp(-pow((vUv.x - 0.5) / 0.26, 2.0));
  // 极慢的横向呼吸，避免线在静帧里显得像一条 UI 分割线。
  float breath = 0.92 + 0.08 * sin(vUv.x * 6.0 + uTime * 0.7);
  float a = (line * 0.85 + halo * 0.42) * axis * breath * uGlow;
  vec3 col = mix(uColor, uDawn, clamp(uGlow, 0.0, 1.0) * 0.7);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * (1.0 + uGlow * 0.8), a);
}`;
