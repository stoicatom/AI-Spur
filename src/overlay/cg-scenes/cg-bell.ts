/**
 * 场景 21 bell（echo · 古钟余韵，1200ms）。
 *
 * 三幕（规格 §4.2 场景 21）：
 * - 0–200ms    撞钟
 * - 200–700ms  钟身驻波 + 泛音环
 * - 700–1200ms 余韵残留
 *
 * 互动：①撞球撞击后钟波沿钟身传播——驻波的波前高度由撞击后经过的
 * 时间决定，撞击未发生时波前在钟口以下、整层无光；②泛音环按频率
 * 分层扩散——每个分音的环有**自己的**发出延时（∝1/频率比）与扩散
 * 速度（∝√频率比），因此五环永不重合。
 *
 * 独立签名：**唯一「驻波 + 泛音分层」可视**。与 guitar（场景 19）的
 * 「弦→音孔→环」机制不同，两处差异都写在数学里而非美术里：
 * - guitar 全部谐波共享一条 exp 包络（拨弦：起振极快后单调衰减）；
 *   bell 的五个分音**各有自己的衰减时间常数**（高频先熄，谱心随时间
 *   下降），且每个分音因钟体不完全轴对称裂成双分音，合成包络出现
 *   **拍频**——余韵振幅有起伏，不是单调下降（见 ./bell-partials）。
 * - guitar 的传导链是弦→腔→环；bell 是撞击→钟体→空气（钟体本身
 *   就是辐射体，没有共鸣腔这一级）。
 *
 * 元素搭建在 ./bell-parts，泛音数学在 ./bell-partials，
 * 时间轴纯函数在 ./bell-timeline。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub, scaledCount } from '../cg-particle-kit';
import { buildBellParts } from './bell-parts';
import {
  AIR_DELAY,
  BELL_PARTIALS,
  BODY_DELAY,
  echoChain,
  partialEnvelope,
  resonanceEnvelope,
  spectralCentroid,
  strikeImpulse,
} from './bell-partials';
import {
  BELL_ACT1_END,
  BELL_ACT2_END,
  GHOST_SPACING,
  STRIKE_AT,
  bendingWaveFront,
  partialPhase,
  partialRingRadius,
  strikerApproach,
} from './bell-timeline';

/** 空气波纹三层之间的推出间隔（整幕归一化）。 */
const RIPPLE_LAG = 0.06;

function createBellStage(ctx: CgStageContext): CgStage {
  const parts = buildBellParts(ctx);
  const {
    res, temple, body, standing, rings, ripples, striker, ghosts, echoAnchor,
    mouth, bellH, strikeFrom, strikeTo, scale,
  } = parts;
  const { height } = ctx;

  // ⑤ 余韵拖尾（规格元素⑤）：衰减光点，几何贴片表达不了逐点熄灭。
  const hub = createParticleHub(res.group, ctx.quality);
  const echo = hub.emit({
    count: 96,
    lifetime: [0.5, 1.3],
    speed: [scale * 0.5, scale * 2.2],
    size: [1.2, 3.2],
    color: new THREE.Color('#FFE2A6'),
    shape: 'sphere',
    spread: bellH * 0.3,
    position: new THREE.Vector3(mouth.x, mouth.y, 8),
    looping: true,
    rate: 52,
  });
  /** 电影级下拖尾的峰值发射率；降档由 scaledCount 同比缩小。 */
  const echoRate = scaledCount(96, ctx.quality);

  // 环心：钟体重心（泛音由钟体整体辐射，不是从某个孔洞发出）。
  const ringOrigin = new THREE.Vector2(0.5, 0.5 + (mouth.y * 0.4) / (height * 1.5));
  for (const ring of rings) ring.mesh.material.uniforms.uOrigin.value = ringOrigin;
  for (const rip of ripples) rip.material.uniforms.uOrigin.value = ringOrigin;

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const [act1, , act3] = acts(t, BELL_ACT1_END, BELL_ACT2_END);
      // 因果链：撞击 → 钟体 → 空气，下游取上游滞后值。
      const chain = echoChain(t, STRIKE_AT);
      const resonance = resonanceEnvelope(t, STRIKE_AT);
      const centroid = spectralCentroid(t, STRIKE_AT);

      // ⑧ 背景庙宇：整幕常在，被余韵染出一层天光。
      temple.material.uniforms.uAlpha.value = Math.min(1, 0.35 + act1 * 0.6);
      temple.material.uniforms.uGlow.value = chain.air * 0.9;

      // ① 钟身：整幕常在，随钟体驻波泛光。
      body.material.uniforms.uAlpha.value = Math.min(1, 0.3 + act1 * 0.75);
      body.material.uniforms.uRing.value = chain.body;

      // ③ 钟波：各分音的环向驻波叠加，波前沿钟体上行。
      const front = bendingWaveFront(t);
      const su = standing.material.uniforms;
      const amps = su.uAmp.value as number[];
      const phases = su.uPhase.value as number[];
      for (let i = 0; i < BELL_PARTIALS.length; i += 1) {
        // 钟面看到的是 BODY_DELAY 之前的激励：与链的第二段同源。
        amps[i] = partialEnvelope(t - BODY_DELAY, i, STRIKE_AT);
        phases[i] = partialPhase(t, i);
      }
      su.uFront.value = front;
      // 波前尚未离开钟口（撞击前）时整层归零。
      su.uAlpha.value = front < 0 ? 0 : 1.15;

      // ④ 泛音光环：五层各自的延时与速度，永不重合。
      for (const ring of rings) {
        const u = ring.mesh.material.uniforms;
        const r = partialRingRadius(t, ring.partial);
        if (r < 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        u.uRadius.value = r;
        // 环的亮度由该分音**自己的**包络驱动：高分音的环先熄。
        // 该包络取自空气段的滞后时刻，钟体不振则空间无波。
        u.uAlpha.value = partialEnvelope(
          t - BODY_DELAY - AIR_DELAY, ring.partial, STRIKE_AT,
        ) * 1.5;
      }

      // ⑥ 空气波纹：三层错峰推出，半径跟着最慢的基频波前。
      for (let i = 0; i < ripples.length; i += 1) {
        const u = ripples[i].material.uniforms;
        const r = partialRingRadius(t - i * RIPPLE_LAG, 0);
        u.uRadius.value = Math.max(0, r);
        u.uAlpha.value = r < 0 ? 0 : chain.air * 0.95;
      }

      // ② 撞球：摆动飞入，撞击瞬间被弹回一小段并随后淡出。
      const approach = strikerApproach(t);
      const bounce = strikeImpulse(t, STRIKE_AT) * scale * 0.9;
      striker.position.set(
        strikeFrom.x + (strikeTo.x - strikeFrom.x) * approach - bounce,
        strikeFrom.y + (strikeTo.y - strikeFrom.y) * approach,
        10,
      );
      // 撞击后随余韵淡出（钟舌回摆离开视野）。
      striker.material.opacity = t < STRIKE_AT
        ? Math.min(1, 0.35 + approach * 0.65)
        : Math.max(0, 1 - (t - STRIKE_AT) / 0.28);

      // ⑦ 钟舌残影：撞击轨迹上的一串淡影，越旧越淡。
      const ghostFade = Math.max(0, 1 - Math.abs(t - STRIKE_AT) / 0.2);
      for (let i = 0; i < ghosts.length; i += 1) {
        const past = strikerApproach(t - (i + 1) * GHOST_SPACING);
        ghosts[i].position.set(
          strikeFrom.x + (strikeTo.x - strikeFrom.x) * past,
          strikeFrom.y + (strikeTo.y - strikeFrom.y) * past,
          6,
        );
        ghosts[i].material.opacity = ghostFade * (0.5 - i * 0.1);
        ghosts[i].scale.setScalar(0.85 - i * 0.12);
      }

      // ⑤ 余韵拖尾：发射率由余韵包络驱动，钟静则光点息；
      // 谱心下降使拖尾光点在末幕变小（高频成分先消失）。
      echoAnchor.position.set(mouth.x, mouth.y + act3 * bellH * 0.1, 8);
      if (echo) {
        echo.emissionOverTime = new ConstantValue(resonance * echoRate * 0.55);
        echo.emitter.position.copy(echoAnchor.position);
        echo.startSize = new ConstantValue(1 + centroid * 0.6);
      }
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'bell',
    title: '古钟余韵',
    elements: ['钟身 mesh', '撞球', '钟波', '泛音光环', '余韵拖尾', '空气波纹', '钟舌残影', '背景庙宇剪影'],
    signature: '唯一"驻波+泛音分层"可视；与吉他（弦→音孔）机制不同（钟体→空间泛音）',
    preset: 'echo',
  },
  createBellStage,
);

export { createBellStage };
