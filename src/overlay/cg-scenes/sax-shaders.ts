/**
 * 场景 39 saxophone 的片元着色器。
 *
 * 与 piano 的着色器不共用：那边是乌木直角的键盘，这边是黄铜曲面的管身，
 * 高光的走向与材质粗糙度完全不同。管身的**弯颈**必须画出来（规格元素①
 * 明写「黄铜管身+按键列+弯颈」）——一根直管看起来是长笛，不是萨克斯。
 */

/** ① 萨克斯 mesh：弯颈 + 管身 + 喇叭口 + 按键列。 */
export const SAX_BODY_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSheenColor;
uniform float uAlpha;
uniform float uKeyLight[5];
uniform float uSheenSeat;
varying vec2 vUv;

/** 到一条线段的距离，用于把管身拼成分段折线。 */
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 p = vUv;

  // 管身骨架：从右上的吹嘴斜下（弯颈），转竖直（管身），再朝左张开
  // （喇叭口）。三段折线的距离场并起来就是萨克斯的侧影。
  float neck = segDist(p, vec2(0.72, 0.94), vec2(0.60, 0.72));
  float bend = segDist(p, vec2(0.60, 0.72), vec2(0.56, 0.46));
  float tube = segDist(p, vec2(0.56, 0.46), vec2(0.52, 0.16));
  float bell = segDist(p, vec2(0.52, 0.16), vec2(0.28, 0.08));

  // 各段粗细不同：颈细、管中、口最粗（喇叭张开）。
  float d = min(min(neck / 0.026, bend / 0.040), min(tube / 0.048, bell / 0.075));
  if (d > 1.0) discard;

  // 黄铜受光：管身左侧受舞台灯，右侧入暗。曲面高光是一道窄带。
  float lit = 0.34 + 0.66 * smoothstep(1.0, 0.0, d);
  // 纵向高光带：位置由 uSheenSeat 驱动（⑤ 铜管反光带随光束摆动）。
  float sheen = exp(-pow((p.y - uSheenSeat) * 9.0, 2.0)) * smoothstep(0.9, 0.2, d);

  // ② 按键列：沿管身等距排布，各自独立亮起。
  float keys = 0.0;
  for (int i = 0; i < 5; i += 1) {
    float ky = 0.62 - float(i) * 0.095;
    vec2 seat = vec2(0.585 - float(i) * 0.011, ky);
    float kd = length((p - seat) * vec2(1.6, 1.0));
    keys += (1.0 - smoothstep(0.014, 0.024, kd)) * (0.28 + uKeyLight[i] * 1.9);
  }

  vec3 col = uColor * lit + uSheenColor * (sheen * 0.9 + keys * 0.42);
  float edge = smoothstep(1.0, 0.82, d);
  gl_FragColor = vec4(col, uAlpha * edge);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ③ 音符摇曳：与 piano 的音符形状不同——爵士音符带连音符尾。 */
export const SAX_NOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTilt;
varying vec2 vUv;

void main() {
  // 随摆动倾斜：音符被气流吹得歪，这是「摇曳」在单个音符上的体现。
  float c = cos(uTilt), s = sin(uTilt);
  vec2 p = vUv - 0.5;
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

  // 符头：斜椭圆。
  vec2 head = (p - vec2(-0.14, -0.2)) * vec2(1.0, 1.55);
  head = vec2(head.x * 0.92 - head.y * 0.39, head.x * 0.39 + head.y * 0.92);
  float body = 1.0 - smoothstep(0.1, 0.14, length(head));

  // 符干 + 一道弧形连音尾（爵士的连奏记号）。
  float stem = step(abs(p.x - 0.0), 0.02) * step(-0.18, p.y) * step(p.y, 0.32);
  float tailR = length(p - vec2(0.13, 0.19));
  float tail = (1.0 - smoothstep(0.015, 0.03, abs(tailR - 0.14)))
    * step(p.x, 0.2) * step(0.02, p.y);

  float mask = clamp(body + stem + tail, 0.0, 1.0);
  // 暖光晕：舞台灯下音符自带辉光。
  float halo = exp(-length(p) * 4.6) * 0.4;
  gl_FragColor = vec4(uColor * (0.66 + mask * 0.9) + mask * 0.3, (mask + halo) * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ④ 管口热雾：一团朝上飘散的软雾（呼出的气）。 */
export const SAX_MIST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uLevel;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  // 上升的雾：越往上越散、越淡。
  float up = (p.y + 1.0) * 0.5;
  float spread = 0.28 + up * 0.62;
  float core = exp(-pow(p.x / spread, 2.0) * 2.4);
  // 三层错相的横向漂移，避免一团规则的高斯斑。
  float wob = sin(p.y * 4.2 + uTime * 1.7) * 0.16
    + sin(p.y * 7.9 - uTime * 1.1) * 0.09;
  core *= exp(-pow((p.x - wob) / spread, 2.0) * 1.6);
  float a = core * uLevel * (1.0 - up * 0.72);
  gl_FragColor = vec4(uColor * (0.5 + uLevel * 0.8), a * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ⑧ 摇摆光束：从上方斜射的一束锥光，绕顶点摆动。 */
export const SAX_BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uLevel;
varying vec2 vUv;

void main() {
  // 光束以贴片上边中点为顶点朝下张开。
  vec2 p = vec2((vUv.x - 0.5) * 2.0, 1.0 - vUv.y);
  float halfWidth = 0.07 + p.y * 0.42;
  float core = exp(-pow(p.x / max(0.02, halfWidth), 2.0) * 2.2);
  // 沿程衰减：光在空气里被吃掉。
  float atten = exp(-p.y * 1.35);
  float a = core * atten * uLevel;
  gl_FragColor = vec4(uColor * (0.55 + uLevel * 0.9), a * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ⑦ 舞台暗幕：中心透亮、四周压暗的背景（聚光灯下的舞台）。 */
export const SAX_STAGE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uPulse;
varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p * vec2(0.82, 1.0));
  // 暗角：外圈压到近黑，中心留一圈暖底。
  float vig = smoothstep(1.32, 0.24, r);
  // ⑥ 节奏鼓点光：整幅背景随拍轻微提亮。
  float beat = uPulse * 0.36 * vig;
  vec3 col = uColor * (0.1 + vig * 0.26 + beat);
  gl_FragColor = vec4(col, uAlpha * (0.62 + vig * 0.3));
}
`;
