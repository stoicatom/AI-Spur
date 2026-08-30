/**
 * 场景 32 downpour（downpour · 倾盆大雨，1900ms）。
 *
 * 三幕（规格 §4.2 场景 32）：
 * - 0–400ms    雨至：雨帘压入、远幕成形
 * - 400–1450ms 雨帘 + 涟漪万环 + 远处弱闪
 * - 1450–1900ms 雨渐止 + 积水退
 *
 * 互动：①涟漪环从溅点连成片——溅点强度 `splashPulse` 同时门控白雾团亮度
 * 与涟漪可见数，一强俱强；②风摆改变雨向**同时**带动涟漪方向——
 * 雨的入射角与涟漪的椭圆压扁比/长轴朝向读的是同一个 `windSpeed`/`windAngle`。
 *
 * 独立签名：**一个风场同时驱动两种介质**。同一风场在空气里表现为雨的
 * 入射角（弹道，drag 0.999 近乎无阻力），在水面上表现为涟漪的椭圆几何
 * （斜射水花沿水平动量方向铺开）。全库其余环境场都是「一场风驱动一种介质」；
 * ice 的签名是「一种介质（雪）× 两个视差系数」，两者刻意不撞——
 * 所以本场景的④雨幕深浅走**大气透视**（远层更淡、对比度更低）而非速度差。
 *
 * 元素搭建在 ./downpour-parts、./downpour-curtain、./downpour-ripples，
 * 本文件只做时间轴编排。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts } from '../cg-scene-kit';
import { buildDownpourParts } from './downpour-parts';
import { createRainCurtain } from './downpour-curtain';
import { createRippleField } from './downpour-ripples';
import {
  DOWNPOUR_ACT1_END,
  DOWNPOUR_ACT2_END,
  farFlash,
  puddleLevel,
  rainDensity,
  splashPulse,
  windAngle,
} from './downpour-field';

/** 场景总时长（毫秒）。 */
const TOTAL_MS = 1900;

export { DOWNPOUR_ACT1_END, DOWNPOUR_ACT2_END };

function createDownpourStage(ctx: CgStageContext): CgStage {
  const parts = buildDownpourParts(ctx);
  const { res, haze, puddle, groundFog, flashVeil, puffs, short, groundTop, groundBottom } = parts;

  const curtain = createRainCurtain(
    res, ctx,
    // 覆盖范围大于画面：斜雨的横向漂移要有余量，否则环绕重入会露出接缝。
    ctx.width * 1.6, ctx.height * 1.25,
  );
  const ripples = createRippleField(res, ctx, short, groundTop, groundBottom);

  return {
    update(t, now, _quality): void {
      if (res.disposed) return;
      const [a1, , a3] = acts(t, DOWNPOUR_ACT1_END, DOWNPOUR_ACT2_END);
      const timeS = now / 1000;

      // ⑦风摆：整场只有这一处求风向，下面所有层都取它。
      // 两种介质的响应因此必然同步——这是签名的实现要点。
      const wind = windAngle(t);
      const density = rainDensity(t);
      const flash = farFlash(t);
      const gate = splashPulse(t);

      // ① 雨帘：自身按 density 调不透明度并推进输运。
      curtain.advance(t, short);

      // ④ 雨幕深浅（远层）：与近景共用风向，靠密度与对比度退到背景。
      haze.material.uniforms.uTime.value = timeS;
      haze.material.uniforms.uWindAngle.value = wind;
      haze.material.uniforms.uDensity.value = density;
      // 远幕在雨至阶段先到（远处先看见雨墙压过来）。
      haze.material.uniforms.uAlpha.value = (0.24 + a1 * 0.3) * (0.35 + density * 0.65);

      // ③ 涟漪万环：形状与朝向来自同一风场。
      ripples.advance(t, short);

      // ② 地面雨舞的白雾团：与涟漪共用 splashPulse，因此「一强俱强」。
      for (const { mesh, phase } of puffs) {
        // 各团相位错开，但整体强弱由同一个门控决定。
        const local = Math.max(0, Math.sin((t * 6.2 + phase) * Math.PI));
        mesh.material.opacity = gate * local * 0.34;
        const swell = 0.6 + gate * local * 0.7;
        mesh.scale.setScalar(swell);
      }

      // ⑤ 闪电间隙亮光。
      flashVeil.material.uniforms.uAlpha.value = flash * 0.42;

      // ⑥ 积水反光：水位是雨强的积分，雨停了水还在（第三幕才退）。
      puddle.material.uniforms.uTime.value = timeS;
      puddle.material.uniforms.uWindAngle.value = wind;
      puddle.material.uniforms.uLevel.value = puddleLevel(t);
      puddle.material.uniforms.uFlash.value = flash;
      puddle.material.uniforms.uAlpha.value = Math.min(1, 0.35 + puddleLevel(t) * 0.6);

      // ⑧ 雾气沿地：雨止后雾反而更明显（气温回升、水面蒸发）。
      groundFog.material.uniforms.uTime.value = timeS;
      groundFog.material.uniforms.uWindAngle.value = wind;
      groundFog.material.uniforms.uAlpha.value = 0.16 + a1 * 0.14 + a3 * 0.4;
    },

    dispose(): void {
      ripples.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'downpour',
    title: '倾盆大雨',
    elements: ['雨帘', '地面雨舞', '涟漪万环', '雨幕深浅', '闪电间隙亮光', '积水反光', '风摆', '雾气沿地'],
    signature: '唯一"全域雨幕"；与 ice 雪幕互为雨雪对照',
    preset: 'downpour',
  },
  createDownpourStage,
);

export { createDownpourStage };
export { TOTAL_MS as DOWNPOUR_TOTAL_MS };
