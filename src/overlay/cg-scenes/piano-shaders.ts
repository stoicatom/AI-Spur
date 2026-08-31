/**
 * 场景 38 piano 的片元着色器。
 *
 * 三个可复用的形状函数（键、音符、谱线）都写在片元里而不是靠几何体
 * 堆顶点：八分/十六分/符点三种音符只差符干与旗子，用同一张 plane
 * 加 `uShape` 分支画出来，比建三套几何省一半资源，也让形状切换是
 * 一个 uniform 而不是重建 mesh。
 */

/** ① 琴身：琴盖 + 黑白键列。键的明暗由 uFlash 数组逐键驱动。 */
export const PIANO_BODY_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uKeyFlash[7];
uniform float uBoardGlow;
varying vec2 vUv;

void main() {
  vec2 p = vUv;
  float alpha = 0.0;
  vec3 rgb = vec3(0.0);

  // 键列占下半部：白键 7 条，黑键嵌在缝隙上半段。
  if (p.y < 0.52) {
    float ky = p.y / 0.52;
    float slot = p.x * 7.0;
    int idx = int(floor(slot));
    float inKey = fract(slot);
    // 键缝：两侧各留一线暗边。
    float seam = smoothstep(0.0, 0.035, inKey) * smoothstep(1.0, 0.965, inKey);
    float flash = 0.0;
    for (int i = 0; i < 7; i += 1) { if (i == idx) flash = uKeyFlash[i]; }
    // 按下的键整体下沉一点：亮度峰值处最沉。
    float press = flash * 0.06;
    float keyBody = step(ky, 0.94 - press) * seam;
    // 白键底色偏冷白，闪光把它推向暖色。
    vec3 white = mix(vec3(0.86, 0.88, 0.93), uColor * 1.6 + 0.5, flash);
    rgb += white * keyBody;
    alpha = max(alpha, keyBody * 0.95);

    // 黑键：在奇数缝上，只占键长上 62%。
    float gap = abs(inKey - 0.5);
    float isBlackSlot = (idx == 0 || idx == 3) ? 0.0 : 1.0;
    float black = step(gap, 0.17) * step(0.38, ky) * isBlackSlot;
    rgb = mix(rgb, vec3(0.05, 0.06, 0.09) + uColor * flash * 0.9, black);
    alpha = max(alpha, black * 0.98);
  } else {
    // 琴盖：斜向高光带，靠近键列处更亮（共鸣板光从缝里透出）。
    float lid = (p.y - 0.52) / 0.48;
    float sheen = exp(-pow((p.x + lid * 0.3 - 0.62) * 3.4, 2.0));
    float glow = uBoardGlow * exp(-lid * 2.6);
    rgb = uColor * (0.24 + sheen * 0.5 + glow * 1.5) + glow * 0.4;
    alpha = 0.9 * (1.0 - lid * 0.25) + glow * 0.2;
  }

  gl_FragColor = vec4(rgb, alpha * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ③ 音符精灵：uShape 选八分（0）/十六分（1）/符点（2）。 */
export const NOTE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uShape;
uniform float uSpin;
varying vec2 vUv;

void main() {
  // 绕中心转一点：跃动时音符会翻，静止的音符像贴纸。
  float c = cos(uSpin), s = sin(uSpin);
  vec2 p = vUv - 0.5;
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

  // 符头：椭圆，略倾斜（真实符头是斜的）。
  vec2 head = (p - vec2(-0.12, -0.22)) * vec2(1.0, 1.5);
  head = vec2(head.x * 0.94 - head.y * 0.34, head.x * 0.34 + head.y * 0.94);
  float body = 1.0 - smoothstep(0.11, 0.15, length(head));

  // 符干：从符头右上竖起。
  float stem = step(abs(p.x - 0.02), 0.022) * step(-0.2, p.y) * step(p.y, 0.34);

  // 旗子：八分一面，十六分两面；符点无旗但右侧有点。
  float flag = 0.0;
  if (uShape < 1.5) {
    float f1 = exp(-pow((p.y - 0.28) * 13.0, 2.0)) * smoothstep(0.02, 0.16, p.x) * step(p.x, 0.2);
    flag = f1;
    if (uShape > 0.5) {
      flag += exp(-pow((p.y - 0.15) * 13.0, 2.0)) * smoothstep(0.02, 0.16, p.x) * step(p.x, 0.2);
    }
  }
  float dot0 = (uShape > 1.5)
    ? (1.0 - smoothstep(0.03, 0.05, length(p - vec2(0.15, -0.22))))
    : 0.0;

  float mask = clamp(body + stem + flag + dot0, 0.0, 1.0);
  // 边缘辉光：音符自带一层光晕，暗背景下才有「精灵」感。
  float halo = exp(-length(p) * 5.2) * 0.35;
  gl_FragColor = vec4(uColor * (0.7 + mask * 0.9) + mask * 0.35, (mask + halo) * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ④ 五线谱线：横贯全屏的发光细线，亮度由音符邻近度驱动。 */
export const STAFF_LINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
varying vec2 vUv;

void main() {
  // 线心在 v=0.5，厚度随亮度略涨（亮的线看起来更粗）。
  float d = abs(vUv.y - 0.5);
  float core = exp(-pow(d * (30.0 - uGlow * 9.0), 2.0));
  // 两端渐隐：谱线横贯但不硬切在屏缘。
  float fade = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float a = core * fade * (0.3 + uGlow * 0.7);
  gl_FragColor = vec4(uColor * (0.6 + uGlow * 1.4) + uGlow * 0.25, a * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;

/** ⑤ 踏板辉光 / ⑦ 节拍闪烁共用：一团各向同性的软光。 */
export const PIANO_GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = exp(-d * d * 3.1);
  float ring = exp(-pow((d - 0.55) * 3.6, 2.0)) * 0.4;
  float a = (core + ring) * uIntensity;
  gl_FragColor = vec4(uColor * (0.5 + uIntensity * 1.5) + core * uIntensity * 0.4, a * uAlpha);
  if (gl_FragColor.a < 0.004) discard;
}
`;
