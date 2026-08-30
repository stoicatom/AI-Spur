/**
 * 场景 14 star（star-burst · 星芒礼花，1200ms）。
 *
 * 三幕（规格 §4.2 场景 14）：
 * - 0–200ms    星体凝聚
 * - 200–800ms  星芒爆发 + 星轨
 * - 800–1200ms 星屑弹跳 + 残星
 *
 * 互动：①星轨顶点剥落小星点——星点的**出生位置就是它认领那条轨的当前顶端**
 * （`ray.tip` 锚点），不是在星心附近随机撒；②环波推散星屑——星屑的径向
 * 加速度由波前是否扫到它的半径决定（见 ./star-grit 的 pushWeight），
 * 写成定时推散或把半径写成常量都会让因果消失。
 *
 * 独立签名：**唯一「五轴对称」爆发 + 随机单帧变色彩蛋全库唯一**。
 * 对称由 ./star-signature 的 `axisAngle`（严格 72° 等分）与 `axisLength`
 * （**形参不含轴索引**，五轨只能同长）保证；彩蛋由确定性种子锁定整幕
 * 唯一一个帧格，不用 Math.random——否则验收无法复现。
 *
 * 与 fireworks 的区别：那边是多发球状绽放（升空—延时—多形态—连环），
 * 这边是单体五轴定向伸展，且带全库唯一的变色彩蛋。
 *
 * 元素搭建在 ./star-parts 与 ./star-field，星屑物理在 ./star-grit。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildStarParts } from './star-parts';
import { updateTwinkle } from './star-field';
import { createGritField } from './star-grit';
import {
  CHROMA_HUE_SHIFT, STAR_ACT1_END, STAR_ACT2_END,
  axisLength, burstProgress, chromaFrame, chromaSeed, hoopRadii, isChromaFrame,
} from './star-signature';

export { STAR_ACT1_END, STAR_ACT2_END };

/**
 * 彩蛋种子的输入串（纯函数，暴露给验收做可复现性核对）。
 *
 * 绑定素材色与屏幕尺寸：同一素材同一屏幕永远同一帧变色，换素材/换屏才换帧。
 */
export function starChromaKey(ctx: Pick<CgStageContext, 'color' | 'width' | 'height'>): string {
  return `star|${ctx.color.getHexString()}|${ctx.width}x${ctx.height}`;
}

/** 本上下文下的彩蛋帧号（验收据此定位那一帧）。 */
export function starChromaFrame(ctx: Pick<CgStageContext, 'color' | 'width' | 'height'>): number {
  return chromaFrame(chromaSeed(starChromaKey(ctx)));
}

/** 星点从轨顶剥落后的存活时长（整幕归一化）。 */
const SPECK_LIFE = 0.3;

function createStarStage(ctx: CgStageContext): CgStage {
  const parts = buildStarParts(ctx);
  const { res, core, rays, halos, hoops, chroma, specks, relics, tints, reach, scale } = parts;

  // 彩蛋种子：确定性。Math.random 会让它每次都不同，验收无从复现。
  const seed = chromaSeed(starChromaKey(ctx));

  // ③ 星屑：cannon 小颗粒，受重力与环波推散。
  const grit = createGritField(res, ctx, scale, reach, parts.groundY);
  // 环波半径的时变场：物理追赶循环逐步采样它，不能取快照。
  const radiiAt = (tNorm: number): number[] => hoopRadii(tNorm, reach);

  // ② 星轨的 quarks 喷射层：几何贴片表达不了沿轴飞散的细碎光尘。
  const hub = createParticleHub(res.group, ctx.quality);
  const jets = rays.map((ray) => ({
    ray,
    system: hub.emit({
      count: 60,
      lifetime: [0.2, 0.6],
      speed: [scale * 1.4, scale * 5],
      size: [1.2, 3.4],
      color: ctx.color.clone().lerp(new THREE.Color('#FFF3C8'), 0.7),
      shape: 'cone',
      spread: 0.28,
      position: new THREE.Vector3(0, 0, 2),
      looping: true,
      rate: 0,
    }),
  }));

  let lastNow = ctx.now;
  const tipPos = new THREE.Vector3();

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, STAR_ACT1_END, STAR_ACT2_END);
      const burst = burstProgress(t);
      const len = axisLength(reach, burst);
      const radii = hoopRadii(t, reach);

      // ⑦ 色彩微突变（签名后半）：整幕**恰好一帧**色相整体位移。
      // 全部 tint 同帧换色，读作「画面闪了一下别的颜色」而非某层变了。
      const egg = isChromaFrame(t, seed);
      for (const { base, live } of tints) {
        live.copy(base);
        if (egg) live.offsetHSL(CHROMA_HUE_SHIFT, 0.12, 0.06);
      }
      chroma.material.uniforms.uAlpha.value = egg ? 0.55 : 0;

      // ① 五芒星体：第一幕凝聚，爆发后被自身光晕吞没。
      core.material.uniforms.uCharge.value = Math.pow(act1, 0.7);
      core.material.uniforms.uSpin.value = seconds * 1.35;
      core.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6) * (1 - act3 * 0.55);
      core.scale.setScalar(0.35 + Math.pow(act1, 0.6) * 0.75 + burst * 0.35);

      // ② 星轨：五条同长同宽，只有方向不同——这就是「五轴对称」。
      const headLevel = Math.sin(Math.min(1, burst) * Math.PI) * 0.9 + act2 * 0.25;
      for (const ray of rays) {
        const u = ray.mesh.material.uniforms;
        // 贴片以中心为原点，所以根在星心时中心要落在半程处。
        ray.mesh.position.set(ray.dir.x * len * 0.5, ray.dir.y * len * 0.5, 4);
        ray.mesh.scale.set(0.5 + burst * 0.6, Math.max(0.001, len / parts.rayBase), 1);
        u.uAlpha.value = burst > 0 ? Math.min(1, burst * 2.4) * (1 - act3 * 0.7) : 0;
        u.uHead.value = burst > 0 ? headLevel : 0;
        // 轨顶锚点：星点从这里剥落，quarks 喷口也镜像到这里。
        ray.tip.position.set(ray.dir.x * len, ray.dir.y * len, 4);
      }

      // ② quarks 喷射：喷口跟着轨顶走，发射率随爆发强度起伏。
      const jetRate = burst > 0 ? (1 - Math.abs(burst - 0.45) * 1.4) * 120 : 0;
      for (const jet of jets) {
        if (!jet.system) continue;
        jet.system.emitter.position.copy(jet.ray.tip.position);
        jet.system.emissionOverTime = new ConstantValue(Math.max(0, jetRate));
      }

      // ④ 光晕层：随爆发涨起，末幕缓退。内层比外层更快到峰。
      for (let i = 0; i < halos.length; i += 1) {
        const u = halos[i].material.uniforms;
        const lead = Math.min(1, Math.max(0, burst * (1.5 - i * 0.32)));
        u.uAlpha.value = (0.12 * act1 + lead * 0.5) * (1 - act3 * 0.6);
        halos[i].scale.setScalar(0.45 + lead * 0.75);
      }

      // ⑥ 环状波：半径由纯函数给出（时间的函数，不是常量），
      // 星屑那边采样同一条曲线——互动②的「同一个波前」由此保证。
      for (let i = 0; i < hoops.length; i += 1) {
        const u = hoops[i].material.uniforms;
        const r = radii[i];
        if (r < 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        // 换算到贴片自身 UV（贴片是 2.2 倍屏幕）。
        u.uRadius.value = r / (ctx.width * 2.2);
        u.uAlpha.value = 0.85 * (1 - act3 * 0.35);
        u.uThickness.value = 0.012 + (r / reach) * 0.02;
      }

      // ⑤ 小星星点缀：整幕在场，爆发时被照亮一档。
      updateTwinkle(parts.twinkle, parts.twinkleSeeds, seconds, 0.6 + burst * 0.5);

      // 互动① 剥落小星点：出生位置＝认领那条轨的**当前顶端**。
      for (const speck of specks) {
        const age = t - speck.bornAt;
        if (age < 0 || age > SPECK_LIFE) {
          speck.dot.visible = false;
          speck.dot.material.opacity = 0;
          continue;
        }
        speck.dot.visible = true;
        const tip = rays[speck.axis].tip;
        // 剥落后沿轨继续外飘并侧偏，越老离顶端越远。
        const k = age / SPECK_LIFE;
        const dir = rays[speck.axis].dir;
        tipPos.copy(tip.position);
        speck.dot.position.set(
          tipPos.x + dir.x * k * reach * 0.16 - dir.y * speck.drift * k * reach * 0.12,
          tipPos.y + dir.y * k * reach * 0.16 + dir.x * speck.drift * k * reach * 0.12,
          12,
        );
        speck.dot.material.opacity = Math.min(1, (1 - k) * 1.6) * 0.9;
        speck.dot.scale.setScalar(0.6 + (1 - k) * 0.8);
      }

      // ⑧ 残星点：环绕星体缓漂，末幕接管画面。
      const relicLevel = Math.min(1, act2 * 0.5 + act3 * 1.2);
      for (const relic of relics) {
        const spin = relic.angle + seconds * 0.4;
        const r = relic.radius * (0.35 + burst * 0.65);
        relic.dot.position.set(Math.cos(spin) * r, Math.sin(spin) * r, 8);
        relic.dot.material.opacity =
          relicLevel * (0.45 + 0.4 * Math.sin(seconds * 3.1 + relic.phase));
      }

      // ③ 星屑：物理由场景时间轴驱动（不是渲染 delta），
      // 环波半径以函数形式传入，追赶循环内逐步采样。
      grit.advance(t, radiiAt);
      grit.setOpacity(Math.min(1, act2 * 2.2) * (1 - act3 * 0.25));
    },

    dispose(): void {
      if (res.disposed) return;
      grit.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'star',
    title: '星芒礼花',
    elements: ['五芒星体', '星轨', '星屑', '光晕层', '小星星点缀', '环状波', '色彩微突变', '残星点'],
    signature: '唯一"五轴对称"爆发；随机单帧变色彩蛋全库唯一',
    preset: 'star-burst',
  },
  createStarStage,
);

export { createStarStage };
