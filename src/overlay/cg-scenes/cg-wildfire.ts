/**
 * 场景 33 wildfire（wildfire · 野火燎原，1750ms）。
 *
 * 三幕（规格 §4.2 场景 33）：
 * - 0–300ms     起火（第一簇燃起，火线尚在左端）
 * - 300–1300ms  蔓延（火线跨屏推进，烟柱与余烬拉出纵深）
 * - 1300–1750ms 烧尽（明焰退去，焦土余烬留痕）
 *
 * 互动：①**火星是引燃信使**——落点领先火线 `EMBER_LEAD`，某处的点燃
 * 时刻严格晚于火星飞抵该处的时刻，下一簇因此是被前方落下的火星点起来
 * 的；②**风助火力同源**——`windGust` 一个量同时决定推进速率
 * （`spreadRate`）与火舌倾角（`flameLean`），风大时火跑得快**且**倒得
 * 厉害，不是两处各自调参。
 *
 * 独立签名：**唯一「蔓延式火势」（二维推进）**，与 flame（场景 09 单点
 * 定驻火柱）构成对照。两者素材身份同为 fire/combustion，所以分野必须
 * 落在运动学上——flame 的火舌横坐标整场 `|x| < 1e-6`，本场景的火线净
 * 推进 0.84 屏宽；而「推进」的不可伪造证据是**每簇火的点燃时刻是它横
 * 坐标的函数**（`igniteAt`）加上**焦土不可愈合**（`charLevel` 单调）。
 *
 * 元素搭建在 ./wildfire-parts，火星在 ./wildfire-embers，
 * 签名数学在 ./wildfire-front 与 ./wildfire-burn，本文件只做编排。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildWildfireParts, toPixelX } from './wildfire-parts';
import { createWildfireEmberLayer } from './wildfire-embers';
import {
  WILDFIRE_ACT1_END,
  WILDFIRE_ACT2_END,
  WILDFIRE_DURATION_MS,
  flameLean,
  frontX,
  spreadProgress,
  windGust,
} from './wildfire-front';
import { charLevel, clumpBurn, heatDistortion, smokeColumn } from './wildfire-burn';

export { WILDFIRE_ACT1_END, WILDFIRE_ACT2_END, WILDFIRE_DURATION_MS };

/** 把屏宽比例（-0.5→0.5 量纲）换成 shader 的 uv 横坐标（0→1）。 */
function toUv(ratio: number): number {
  return ratio + 0.5;
}

function createWildfireStage(ctx: CgStageContext): CgStage {
  const parts = buildWildfireParts(ctx);
  const { res, grass, front, heat, smoke, clumps, charPatches, gustLines } = parts;
  const { width, short, groundY } = parts;

  const embers = createWildfireEmberLayer(res, ctx, short);
  let lastNow = -1;

  return {
    update(t, now, _quality): void {
      if (res.disposed) return;
      const [a1, , a3] = acts(t, WILDFIRE_ACT1_END, WILDFIRE_ACT2_END);
      const timeS = now / 1000;
      // 首帧没有前值可比，给 0 而不是一个凭空的步长。
      const delta = lastNow < 0 ? 0 : frameDelta(now, lastNow);
      lastNow = now;

      // 整场只在这里求这三个量，下面所有层都取它们——两个互动因此是
      // 同源的必然结果，不是两处各自调参。
      const fx = frontX(t);
      const gust = windGust(t);
      const lean = flameLean(t);
      const fxUv = toUv(fx);

      // ① 火线蔓延：uFront 是签名在画面上的落点，火只存在于它附近。
      front.material.uniforms.uTime.value = timeS;
      front.material.uniforms.uFront.value = fxUv;
      front.material.uniforms.uLean.value = lean;
      front.material.uniforms.uAlpha.value = Math.min(1, a1 * 1.4) * (1 - a3 * 0.72);

      // ② 草地层：焦黑边界跟着火线走，逐像素判定已烧/未烧。
      grass.material.uniforms.uFront.value = fxUv;
      grass.material.uniforms.uAlpha.value = Math.min(1, 0.24 + t * 3);

      // ③ 火舌浪：每簇按**自己的横坐标**决定的时刻点燃（签名本体）。
      for (const { mesh, x, phase } of clumps) {
        const burn = clumpBurn(t, x);
        mesh.material.opacity = burn * 0.92;
        // 高度随燃烧强度起伏，各簇错相摆动（不是整片同步明暗）。
        const wob = 0.86 + 0.14 * Math.sin(t * 26 + phase);
        mesh.scale.set(1 + burn * 0.24, Math.max(0.02, burn * wob * 1.5), 1);
        // 火舌随风倾斜：与推进速率同源于 windGust（互动②）。
        mesh.rotation.z = -lean;
        // 贴片下沿钉在地面：缩放后中心要跟着抬，否则火会陷进地里。
        mesh.position.set(
          toPixelX(x, width),
          groundY + short * 0.08 * Math.max(0.02, burn * wob * 1.5),
          mesh.position.z,
        );
      }

      // ⑧ 地面余烬：火线过后留痕，且**不可愈合**（charLevel 单调不减）。
      for (const { mesh, x, yOffset } of charPatches) {
        const char = charLevel(t, x);
        // 刚烧过时最亮（还在阴燃），随后转成暗红但不熄灭——这是「留痕」
        // 而非「闪一下」：整幕结束仍保有底光。
        const fresh = Math.max(0, 1 - Math.max(0, t - 0.18 - char * 0.1) * 1.1);
        mesh.material.opacity = char * (0.28 + fresh * 0.6);
        mesh.scale.setScalar(0.5 + char * 0.7);
        mesh.position.set(toPixelX(x, width), groundY + yOffset, mesh.position.z);
      }

      // ⑥ 火星飞升：落点领先火线，是下一簇的引燃因（互动①）。
      embers.advance(t, delta, width, groundY + short * 0.1);

      // ⑦ 风助火力：风线的速度与长度都读同一个 gust。
      for (const { mesh, y, phase } of gustLines) {
        // 闭式漂移：位置由 t 与相位决定，不做逐帧累加。
        const travel = (spreadProgress(t) * 1.6 + phase / (Math.PI * 2)) % 1;
        mesh.position.set((travel - 0.5) * width, y, mesh.position.z);
        mesh.material.opacity = gust * 0.2 * Math.sin(travel * Math.PI);
        mesh.scale.set(0.6 + gust * 0.9, 1, 1);
      }

      // ⑤ 烟柱：根部锚在火线上，所以它随火线横移；被风吹斜。
      const column = smokeColumn(t);
      smoke.material.uniforms.uTime.value = timeS;
      smoke.material.uniforms.uHeight.value = column;
      smoke.material.uniforms.uLean.value = lean;
      smoke.material.uniforms.uAlpha.value = Math.min(1, 0.3 + column * 0.6);
      smoke.position.x = toPixelX(fx, width);

      // ④ 热浪扭曲：跟着火线走，比火势滞后（热柱要先积累）。
      heat.material.uniforms.uTime.value = timeS;
      heat.material.uniforms.uFront.value = fxUv;
      heat.material.uniforms.uStrength.value = heatDistortion(t);
      heat.material.uniforms.uAlpha.value = Math.min(1, 0.24 + column * 0.66);
    },

    dispose(): void {
      if (res.disposed) return;
      embers.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'wildfire',
    title: '野火燎原',
    elements: ['火线蔓延', '草地层', '火舌浪', '热浪扭曲', '烟柱', '火星飞升', '风助火力', '地面余烬'],
    signature: '唯一"蔓延式火势"（二维推进）；与 flame（单点火柱）形成对照',
    preset: 'wildfire',
  },
  createWildfireStage,
);

export { createWildfireStage };
