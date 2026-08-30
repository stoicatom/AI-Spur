/**
 * 场景 18 comet 专属 GLSL。
 *
 * 一段着色器服务两条尾：uSharp 区分离子尾（锐利磁场丝）与尘埃尾
 * （柔和颗粒散射）。共用同一段代码是因为两条尾的**差异在几何**
 * （直 vs 弯，见 ./comet-tails）而非着色，用两段 shader 会让
 * 「双尾同源于一次喷发」这件事在代码里断掉。
 */

/**
 * 彗尾：沿尾长衰减 + 横截面羽化 + 分段断裂。
 *
 * uv.x 沿尾长（0 = 彗核），uv.y 横截面（0.5 = 中轴）。
 * uBreak 是尾迹断裂深度：近日点闪光后尾会断开重新生长，
 * 这是规格互动①的视觉载体。
 */
export const COMET_TAIL_FRAGMENT = `
varying vec2 vUv;
uniform vec3 uColor;
uniform float uTime;
uniform float uAlpha;
uniform float uBreak;
uniform float uSharp;

// 尾部专用哈希：不需要 fbm 的完整噪波，一维足够切段。
float h1(float x) {
  return fract(sin(x * 127.1) * 43758.5453);
}
float n1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(h1(i), h1(i + 1.0), f);
}

void main() {
  float along = vUv.x;
  float across = abs(vUv.y - 0.5) * 2.0;

  // 横截面：离子尾锐（幂次高），尘埃尾柔（幂次低）。
  float falloffPow = mix(1.4, 4.0, uSharp);
  float section = pow(max(0.0, 1.0 - across), falloffPow);

  // 纵向衰减：近核亮，尾梢淡。
  float decay = pow(max(0.0, 1.0 - along), 1.35);

  // 分段断裂：沿尾长切出明暗段。离子尾段界硬，尘埃尾几乎连续。
  float seg = n1(along * 11.0 - uTime * 1.4);
  float hardness = mix(0.55, 1.0, uSharp);
  float segment = mix(1.0, smoothstep(0.5 - 0.35 * hardness, 0.5 + 0.35 * hardness, seg), uBreak);

  float a = section * decay * segment * uAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * (0.6 + decay * 0.85), a);
}`;
