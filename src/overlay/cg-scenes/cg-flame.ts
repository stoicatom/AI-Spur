/**
 * 场景 09 flame（flame-rise · 篝火升腾，1200ms）。
 *
 * 三幕（规格 §4.2 场景 09）：
 * - 0–200ms   引燃
 * - 200–900ms 火舌卷动 + 火星升空
 * - 900–1200ms 渐熄 + 余烬
 *
 * 互动：①火星在火舌顶端脱落升空——脱落高度是火焰包络的函数
 * （`emberDetachHeight`），火矮时低处脱落、火高时脱落点也高；
 * ②光影脉动与粒子发射频率同步——两者读的是同一个 `flickerGate`。
 *
 * 独立签名：**单点定驻火柱**。火驻留在柴堆一点，只沿竖直方向流动，
 * 横向只有摆动没有净位移；与 wildfire（场景 33）的「火线沿地面横向
 * 推进」构成对照——两者素材身份同为 fire/combustion，所以区别必须
 * 落在运动学上。柴堆 + 光影脉动为全库唯一元素组合。
 *
 * 元素搭建在 ./flame-parts、./flame-embers，签名数学在 ./flame-plume，
 * 本文件只做时间轴编排。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildFlameParts } from './flame-parts';
import { createEmberLayer } from './flame-embers';
import {
  FLAME_ACT1_END,
  FLAME_ACT2_END,
  emberGlow,
  flicker,
  flickerGate,
  heatShimmer,
  plumeHeight,
} from './flame-plume';

/** 场景总时长（毫秒）。 */
const TOTAL_MS = 1200;

export { FLAME_ACT1_END, FLAME_ACT2_END };

function createFlameStage(ctx: CgStageContext): CgStage {
  const parts = buildFlameParts(ctx);
  const {
    res, tongue, heat, pool, night, billets, emberDots, smokeWisps, glow,
    tongueHeight, short,
  } = parts;

  const embers = createEmberLayer(res, ctx, short);
  // 火舌贴片下沿即火焰根部，火星脱落高度以此为基准。
  const tongueBaseY = tongue.position.y - tongueHeight * 0.5;
  let lastNow = -1;

  return {
    update(t, now, _quality): void {
      if (res.disposed) return;
      const [a1, , a3] = acts(t, FLAME_ACT1_END, FLAME_ACT2_END);
      const timeS = now / 1000;
      // 首帧没有前值可比，给 0 而不是一个凭空的步长。
      const delta = lastNow < 0 ? 0 : frameDelta(now, lastNow);
      lastNow = now;

      // 整场只在这里求这三个量，下面所有层都取它们——两个互动因此
      // 是同源的必然结果，不是两处各自调参。
      const height = plumeHeight(t);
      const gate = flickerGate(t);
      const wob = flicker(t);

      // ① 火舌：连续流，噪声沿 -y 平流。
      tongue.material.uniforms.uTime.value = timeS;
      tongue.material.uniforms.uHeight.value = height;
      tongue.material.uniforms.uFlicker.value = wob;
      tongue.material.uniforms.uAlpha.value = Math.min(1, height * 1.25);

      // ② 火星：脱落高度跟着包络，发射率跟着门控。
      embers.advance(t, delta, tongueBaseY, tongueHeight);

      // ③ 热浪：比火焰滞后（热柱要先积累起来）。
      heat.material.uniforms.uTime.value = timeS;
      heat.material.uniforms.uStrength.value = heatShimmer(t);
      heat.material.uniforms.uAlpha.value = Math.min(1, 0.2 + height * 0.7);

      // ④ 柴堆：引燃期显形，之后被火照亮（亮度随门控）。
      for (let i = 0; i < billets.length; i += 1) {
        const mesh = billets[i];
        mesh.material.opacity = Math.min(0.95, a1 * 0.7 + gate * 0.3);
        // 被火烤过的木头本身也发暗红光：往橙色偏一点。
        mesh.material.color.setRGB(0.29 + gate * 0.22, 0.21 + gate * 0.08, 0.14);
      }

      // 余烬光斑：与明焰反相，第三幕才显出来。
      const ember = emberGlow(t);
      for (let i = 0; i < emberDots.length; i += 1) {
        const mesh = emberDots[i];
        // 各点错相闪，整体强弱由 emberGlow 决定。
        const local = 0.6 + 0.4 * Math.sin(t * 21 + i * 1.9);
        mesh.material.opacity = ember * local * 0.9;
      }

      // ⑤ 光影脉动：与火星发射率同源（互动②）。
      glow.material.opacity = gate * 0.2;
      // 光晕随门控胀缩，让「脉动」在尺寸上也可见。
      glow.scale.setScalar(0.72 + gate * 0.4);

      // ⑥ 烟丝：从火焰顶端升起，越高越淡越飘。烟在渐熄期最明显
      // （明焰退去后烟没了火光压制）。
      const smokeGain = 0.24 + a3 * 0.62;
      for (const { mesh, x0, phase, rise } of smokeWisps) {
        // 归一化上升进度用闭式：t 与相位决定，不做逐帧累加。
        const climb = (t * rise + phase / (Math.PI * 2)) % 1;
        const y = tongueBaseY + (height * 0.78 + climb * 0.55) * tongueHeight;
        // 横向摆动随高度加大：离火柱越远受气流影响越大。
        mesh.position.set(x0 + Math.sin(climb * 4.2 + phase) * short * 0.05 * climb, y, -7);
        // 上升中变淡，顶端消失。
        mesh.material.opacity = smokeGain * (1 - climb) * 0.5;
        mesh.scale.set(1 + climb * 1.6, 1 + climb * 0.5, 1);
      }

      // ⑦ 背景星火：寒夜环境层，全程恒亮，只随火光被压制。
      night.material.uniforms.uTime.value = timeS;
      // 火旺时星火被地面光冲淡一点，符合观感（亮处看不见暗星）。
      night.material.uniforms.uAlpha.value = 0.62 - gate * 0.18;

      // ⑧ 地面光池：亮度读同一个门控。
      pool.material.uniforms.uGate.value = gate;
      pool.material.uniforms.uAlpha.value = Math.min(1, 0.3 + height * 0.62);
    },

    dispose(): void {
      embers.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'flame',
    title: '篝火升腾',
    elements: ['火舌', '火星', '热浪', '柴堆', '光影脉动', '烟丝', '背景星火', '地面光池'],
    signature: '唯一"连续火焰流"场景；柴堆+光影脉动全库唯一',
    preset: 'flame-rise',
  },
  createFlameStage,
);

export { createFlameStage };
export { TOTAL_MS as FLAME_TOTAL_MS };
