/**
 * 场景 31 tornado（tornado · 龙卷，1800ms）。
 *
 * 三幕（规格 §4.2 场景 31，本场景时长最长）：
 * - 0–450ms    漏斗成形 + 吸入
 * - 450–1250ms 卷扬 + 碎物绕飞
 * - 1250–1800ms 消散畸变 + 尘落
 *
 * 互动：①碎物沿螺旋上升后被甩出——切向/径向/竖向三分量力场的共同
 * 后果，不是脚本化的三段动画；②雨旋进入漏斗瞬间变白——判据是「半径
 * 是否小于该高度的漏斗半径」，几何关系而非定时器。
 *
 * 独立签名：**唯一「垂直气柱 + 吸入」机制**，SDF 噪声旋转体全库唯一。
 * 与 wind 的分界在拓扑：wind 的旋风是横扫画面的一团涡（涡轴在平面内
 * 移动），tornado 是贯通天地的垂直气柱——半径随高度变化，且有明确的
 * 向心吸入把外物拉进来（纯涡旋只有切向速度，物体绕转但半径不变）。
 *
 * 元素搭建在 ./tornado-parts，碎物物理在 ./tornado-junk，
 * 气柱数学在 ./tornado-funnel。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildTornadoParts } from './tornado-parts';
import { createJunkField } from './tornado-junk';
import {
  TORNADO_ACT1_END,
  TORNADO_ACT2_END,
  TORNADO_DURATION_S,
  dissipationFlare,
  funnelMaturity,
  funnelRadius,
  inflowRate,
  rainWhiten,
  swirlOmega,
} from './tornado-funnel';

export { TORNADO_ACT1_END, TORNADO_ACT2_END };

/** 碎物开始被卷入的时刻：漏斗有了雏形之后。 */
const JUNK_START_AT = 0.12;

/**
 * 累计转角（纯函数）。
 *
 * 用闭式积分而非 `omega × elapsed`：成形期角速度随 maturity 涨，
 * 乘法会重复累计。近轴角速度 × 成形度的积分在 [0, t] 上解析可得。
 *
 * @param t 整幕归一化进度
 */
export function funnelSpin(t: number): number {
  // ∫ swirlOmega(0) · maturity(τ) dτ，maturity 分三段积分。
  const omega = swirlOmega(0);
  const a1 = TORNADO_ACT1_END;
  const a2 = TORNADO_ACT2_END;
  const sec = TORNADO_DURATION_S;
  if (t <= 0) return 0;
  if (t < a1) {
    // ∫ (τ/a1)^1.5 dτ = a1/2.5 · (t/a1)^2.5
    return omega * sec * (a1 / 2.5) * Math.pow(t / a1, 2.5);
  }
  const formed = omega * sec * (a1 / 2.5);
  if (t < a2) return formed + omega * sec * (t - a1);
  const cruised = formed + omega * sec * (a2 - a1);
  // ∫ (1 - (k)^0.8) dτ，k = (τ-a2)/(1-a2)
  const span = 1 - a2;
  const k = (t - a2) / span;
  return cruised + omega * sec * span * (k - Math.pow(k, 1.8) / 1.8);
}

function createTornadoStage(ctx: CgStageContext): CgStage {
  const parts = buildTornadoParts(ctx);
  const {
    res, funnel, sand, eye, cloudCap, rootRings, rainLines,
    funnelHeight, groundY, short, scale,
  } = parts;
  const { width, height } = ctx;

  // ② 卷入物（规格元素②）：螺旋上升的尘粒，几何件表达不了成片。
  const hub = createParticleHub(res.group, ctx.quality);
  const intakePos = new THREE.Vector3(0, groundY + short * 0.05, -5);
  const intake = hub.emit({
    count: 140,
    lifetime: [0.8, 1.8],
    speed: [short * 0.3, short * 0.9],
    size: [1.5, 4.5],
    color: new THREE.Color('#C8B79C'),
    shape: 'cone',
    spread: 0.3,
    position: intakePos,
    looping: true,
    rate: 96,
  });

  // 卷入锚点：quarks 的 emitter 会被 BatchedRenderer 摘走。
  const intakeAnchor = new THREE.Object3D();
  intakeAnchor.name = 'intake-anchor';
  res.group.add(intakeAnchor);

  // ⑥ 碎物刚体层。
  const junk = createJunkField(res, ctx, short, groundY, JUNK_START_AT);

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, TORNADO_ACT1_END, TORNADO_ACT2_END);
      const maturity = funnelMaturity(t);
      const flare = dissipationFlare(t);
      const spin = funnelSpin(t);

      // ① 漏斗
      funnel.material.uniforms.uTime.value = seconds;
      funnel.material.uniforms.uMaturity.value = maturity;
      funnel.material.uniforms.uFlare.value = flare;
      funnel.material.uniforms.uSpin.value = spin;
      funnel.material.uniforms.uAlpha.value = Math.min(1, maturity * 1.3);

      // ⑦ 风眼光柱：随成形度收细。
      eye.material.uniforms.uMaturity.value = maturity;
      eye.material.uniforms.uAlpha.value = maturity * 0.5;

      // ⑤ 顶部云盖：整幕压顶，消散期变薄。
      cloudCap.material.uniforms.uTime.value = seconds;
      cloudCap.material.uniforms.uDensity.value = 0.55 * Math.min(1, act1 * 1.4) * (1 - act3 * 0.5);
      cloudCap.material.uniforms.uFlash.value = flare * 0.4;

      // ③ 地面沙幕：随转角旋转，作用范围跟成形度。
      sand.material.uniforms.uSpin.value = spin;
      sand.material.uniforms.uReach.value = maturity;
      sand.material.uniforms.uAlpha.value = 0.5 * Math.min(1, act1 * 1.5) * (1 - act3 * 0.3);

      // ④ 根环：三圈贴地，随成形度扩张、消散期外翻。
      for (let i = 0; i < rootRings.length; i += 1) {
        const ring = rootRings[i];
        const breath = 0.85 + 0.15 * Math.sin(seconds * 3.4 + i * 1.7);
        ring.material.opacity = maturity * (0.35 - i * 0.07) * breath;
        const spread = (0.6 + maturity * 0.6) * (1 + flare * 1.2);
        ring.scale.set(spread, 0.3 * spread, 1);
      }

      // ⑧ 互动② 雨旋：斜雨下落并被吸向轴心，进入漏斗后变白。
      for (const line of rainLines) {
        // 下落：高度随幕递减并循环。
        const h = ((line.h0 - t * line.fall) % 1 + 1) % 1;
        // 吸入：横向位置按 inflowRate 向轴心收（用闭式近似，与刚体同一律）。
        const edge = funnelRadius(h, short, Math.max(0.05, maturity));
        const rNorm = Math.abs(line.x0) / Math.max(1e-6, edge);
        // 吸入位移量：速率 × 已流逝时间，maturity 为零时不吸。
        const pull = inflowRate(rNorm) * short * maturity * t * 0.55;
        const x = line.x0 + Math.sign(line.x0) * pull;
        const y = groundY + h * funnelHeight;
        line.mesh.position.set(x, y, -3);

        // 变白：判据是「是否进入该高度的漏斗内部」。
        const white = rainWhiten(Math.abs(x), h, short, maturity);
        line.mesh.material.opacity = Math.min(1, act1 * 1.4) * (0.25 + white * 0.75)
          * (1 - act3 * 0.7);
        // 进入漏斗后被拉长（被气流抽长）。
        line.mesh.scale.y = 1 + white * 1.6;
      }

      // ⑥ 互动① 碎物：三分量力场，成形度逐步采样。
      const junkElapsed = Math.max(0, t - JUNK_START_AT) * TORNADO_DURATION_S;
      junk.advance(t, junkElapsed, funnelMaturity);
      junk.setOpacity(Math.min(1, act1 * 1.6) * (1 - act3 * 0.5));

      // ② 卷入物发射点：贴地环上，随转角绕行（尘从地面被卷起）。
      const intakeR = short * 0.16 * (0.6 + maturity * 0.6);
      intakePos.set(
        Math.cos(spin * 0.6) * intakeR,
        groundY + short * 0.05,
        -5,
      );
      intakeAnchor.position.copy(intakePos);
      if (intake) {
        intake.emitter.position.copy(intakePos);
        intake.emissionOverTime = new ConstantValue(6 + maturity * 100 + act2 * 30);
      }

      // 屏宽兜底：漏斗与云盖都已按倍数建。
      void width;
      void height;
      void scale;
    },

    dispose(): void {
      if (res.disposed) return;
      junk.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'tornado',
    title: '龙卷',
    elements: [
      '漏斗', '卷入物', '地面沙幕', '根环',
      '顶部云盖', '碎物', '风眼光柱', '雨旋', '消散畸变',
    ],
    signature: '唯一"垂直气柱+吸入"机制；SDF 噪声旋转体全库唯一特例（时长最长 1800ms）',
    preset: 'tornado',
  },
  createTornadoStage,
);

export { createTornadoStage };
