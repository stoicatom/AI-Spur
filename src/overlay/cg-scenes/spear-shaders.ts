/**
 * 场景 27 spear 专属 GLSL。
 *
 * 没有并进 cg-shaders 工具层：贴矛流线、被气流撕开的横向尘云、靶板裂纹
 * 都只有本场景用得上（设计规格 §4.1 规则 2）。
 *
 * 与 bow 云缝 shader 的关键差别：那边的缝**会愈合**（uOpen 张后回落），
 * 这里的尘云裂口只会越撕越宽——所以本 shader 不做「缝缘发光随开度回落」，
 * 而是把裂口两侧的云推开并留下永久的空腔。
 */
import { NOISE_CHUNK } from '../cg-shaders';

/** 尘云裂口分段数：沿矛路取样，每段有自己的撕开宽度。 */
export const TEAR_SEGMENTS = 12;

/**
 * ③ 破空纹：贴着矛杆的流线，速度越高纹越密越亮。
 *
 * 流线沿 x 轴（矛杆方向）拉长，横向按 uv.y 分层。uSpeed 同时控制
 * 条纹密度与亮度——一个量两个出口，快慢在视觉上不会自相矛盾。
 */
export const SPEAR_RIP_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSpeed;
uniform float uPhase;
${NOISE_CHUNK}
void main() {
  vec2 p = vec2(vUv.x, (vUv.y - 0.5) * 2.0);
  // 贴杆：离杆越远越淡，形成包裹杆身的一层薄鞘。
  float hug = exp(-pow(p.y / 0.42, 2.0));
  // 流线：沿杆的高频条纹，密度随速度上升。
  float lanes = sin(p.y * (9.0 + uSpeed * 14.0) + uPhase * 2.3);
  float streak = pow(max(0.0, lanes), 3.0);
  // 尾段拉长：越靠后（uv.x 小）越虚，头部最锐。
  float taper = smoothstep(0.0, 0.62, vUv.x);
  float grain = 0.7 + valueNoise(vec2(vUv.x * 26.0 - uPhase * 6.0, p.y * 5.0)) * 0.5;
  float a = hug * (0.28 + streak * 0.72) * taper * grain * uAlpha * (0.25 + uSpeed * 0.75);
  if (a < 0.006) discard;
  gl_FragColor = vec4(uColor * (0.8 + streak * 1.4), a);
}`;

/**
 * ⑦ 气流云：横向尘云被矛与螺旋气流撕开。
 *
 * uTear 是 TEAR_SEGMENTS 个裂口半宽。片元按自己在矛路上的投影取对应段，
 * 因此裂口可以「前段已被撕得很宽、后段还完好」。
 * 与 bow 云缝相反：本裂口**不愈合**，末幕仍是敞开的空腔。
 */
export const SPEAR_DUST_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uAlpha;
uniform float uTime;
uniform float uPathY;
uniform float uTear[${TEAR_SEGMENTS}];
${NOISE_CHUNK}
void main() {
  // 横向尘云：纵向被压扁的一条带，两层反向漂移。
  float base = fbm(vec2(vUv.x * 4.2 + uTime * 0.05, vUv.y * 9.0 + uTime * 0.017));
  float detail = fbm(vec2(vUv.x * 8.6 - uTime * 0.031, vUv.y * 16.0));
  float mass = base * 0.7 + detail * 0.3;
  // 带状：中线最厚，上下缘羽化。
  float band = exp(-pow((vUv.y - 0.5) / 0.34, 2.0));
  float cloud = smoothstep(0.34, 0.8, mass) * band;
  if (cloud < 0.015) discard;

  // 该片元在矛路上属于第几段：矛路是一条水平线（uPathY 是它的 v 坐标）。
  float fseg = clamp(vUv.x, 0.0, 1.0) * float(${TEAR_SEGMENTS} - 1);
  int i0 = int(floor(fseg));
  int i1 = min(i0 + 1, ${TEAR_SEGMENTS} - 1);
  float tear = mix(uTear[i0], uTear[i1], fract(fseg));

  float dist = abs(vUv.y - uPathY);
  // 裂口：撕开处彻底没有云（不是变淡，是没有）。
  float halfWidth = tear * 0.16;
  if (dist < halfWidth) discard;

  // 裂口缘被气流照亮并卷起（裂口越宽卷得越亮）。
  float edge = exp(-pow((dist - halfWidth) / 0.05, 2.0)) * min(1.0, tear);
  vec3 col = mix(uColor, uEdgeColor, clamp(edge * 1.2, 0.0, 1.0));
  gl_FragColor = vec4(col * (0.6 + mass * 0.55), cloud * uAlpha * (0.7 + edge * 0.6));
}`;

/**
 * ⑥ 靶板裂纹：命中点为心的放射裂纹 + 板面木/石纹。
 *
 * uFront 是裂纹前沿半径：应力从命中点向外传播，越界处没裂到。
 * 与 glass-shot 的蛛网裂纹刻意区分——那里有环向裂纹（玻璃的等应力圈），
 * 这里只有放射长裂 + 木质纤维顺纹撕开（uGrain），是完全不同的破坏形貌。
 */
export const SPEAR_BOARD_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uBoard;
uniform vec3 uCrack;
uniform float uAlpha;
uniform float uFront;
uniform float uImpact;
uniform vec2 uHit;
uniform float uGrain;
${NOISE_CHUNK}
void main() {
  vec2 p = (vUv - uHit) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // 板面：竖向纤维木纹（与 uGrain 方向一致）。
  float fibre = 0.72 + valueNoise(vec2(vUv.x * 90.0, vUv.y * 7.0)) * 0.42;
  vec3 col = uBoard * fibre;

  // 放射裂纹：9 条，角度抖动避免尺规感。
  float seg = 6.2831853 / 9.0;
  float idx = floor((ang + 3.14159265) / seg);
  float jitter = (hash12(vec2(idx, 5.3)) - 0.5) * seg * 0.55;
  float d = abs(mod(ang - jitter + 3.14159265, seg) - seg * 0.5);
  float radial = exp(-pow(d * max(r, 0.05) / 0.017, 2.0));
  // 顺纹撕开：木头沿纤维方向裂得更远，所以水平向多一条主裂。
  float along = exp(-pow(p.y / (0.028 + uGrain * 0.05), 2.0)) * smoothstep(1.2, 0.0, abs(p.x));

  float front = smoothstep(uFront + 0.08, uFront - 0.04, r);
  float hole = smoothstep(uImpact * 0.14, 0.0, r) * uImpact;
  float crack = (radial + along * 0.85) * front;
  col = mix(col, uCrack, clamp(crack * 1.4 + hole, 0.0, 1.0));
  float a = uAlpha * clamp(0.72 + crack * 0.5 + hole * 0.6, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;

/**
 * ⑧ 枪头闪光：刃口高光的十字星芒 + 核心过曝。
 *
 * 与 katana 的刃光刻意区分：那里是沿刃长的一整条高光带，
 * 这里是**一个点**上的星芒——矛只有尖端反光，杆是哑光的。
 */
export const SPEAR_FLARE_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSpin;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float core = exp(-pow(r / 0.13, 2.0));
  // 星芒：四条主芒随刃口姿态缓慢转动。
  float c = cos(uSpin); float s = sin(uSpin);
  vec2 q = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  float spike = exp(-pow(q.y / 0.026, 2.0)) * exp(-pow(q.x / 0.72, 2.0))
              + exp(-pow(q.x / 0.026, 2.0)) * exp(-pow(q.y / 0.72, 2.0));
  float a = (core * 1.1 + spike * 0.6) * uAlpha;
  if (a < 0.006) discard;
  gl_FragColor = vec4(uColor * (1.2 + core * 2.0), min(1.0, a));
}`;
