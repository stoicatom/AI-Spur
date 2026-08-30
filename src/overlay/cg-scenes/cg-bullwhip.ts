/**
 * 场景 37 bullwhip（whip-crack · 甩鞭，1100ms）。
 *
 * 三幕（规格 §4.2 场景 37）：
 * - 0–250ms    扬鞭（手上扬，波开始沿鞭身往梢端跑）
 * - 250–750ms  音爆（梢速穿过阈值 → 激波 + 火花 + 声纹）
 * - 750–1100ms 阻尼摆动（鞭身指数衰减地摆回静止）
 *
 * 两条独立签名，都从纯函数反解、都可断言：
 *
 * **① 链段 + 音爆**（./whip-chain）：第 i 段的转向**滞后**于第 i-1 段，
 * 滞后量 `segmentLag(i)` 严格单增 → 能量沿链从手端传到梢端。段行程沿链
 * 递减（鞭鞘效应）使角速度逐段放大，梢速峰值约为手端的 43 倍，且每个关节
 * 的速度峰值沿链严格单增。音爆时刻 `crackTime()` 是**解方程**
 * `tipSpeed(t) = CRACK_SPEED` 得来的，改鞭鞘参数它会跟着动；
 * 音爆环源点 = `segmentPos(尖, crackTime())`，**不是屏心**。
 *
 * **② 阻尼摆动衰减**（./whip-damping）：音爆后鞭身摆动幅度**指数**衰减，
 * 连续摆动峰的幅度比恒定（= `swayDecayRatio()`，与峰序无关）；末态趋于
 * 静止但不突然归零（幕末仍有约 1.5% 残余）。
 *
 * 与已完成场景的分野：spear 是直飞（横向自由度全绑在绕杆相位上，无波传播）、
 * katana 是切面（瞬时几何分割）、aurora 的行波发生在**可拉伸的带面**上；
 * 本场景独占**刚性链段的相位滞后 + 由此反解出的音爆时刻**。
 * thunder / tornado 的余震是单向衰减包络（不过零），本场景是完整的振荡+包络。
 *
 * 链段数学在 ./whip-chain，阻尼在 ./whip-damping，
 * 元素搭建在 ./bullwhip-parts，着色在 ./bullwhip-shaders，
 * 本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildBullwhipParts, GHOST_SEGMENTS } from './bullwhip-parts';
import {
  CHAIN_SEGMENTS,
  WHIP_ACT1_END,
  WHIP_ACT2_END,
  WHIP_SPAN_S,
  crackOrigin,
  crackTime,
  jointSpeed,
  segmentAngle,
  segmentPos,
  tipPeakSpeed,
  tipSpeed,
} from './whip-chain';
import { swayAngle, swayEnvelope } from './whip-damping';

function createBullwhipStage(ctx: CgStageContext): CgStage {
  const parts = buildBullwhipParts(ctx);
  const { res, lash, ghosts, swayRig, lashLength, short } = parts;

  // 音爆时刻与源点：构建期反解一次，运行期只查。
  // 「环从梢的位置发出」因此是数据依赖，不是环自己定位。
  const crackAt = crackTime();
  const crackPt = crackOrigin();
  const crackX = parts.handAnchor.x + crackPt.x * lashLength;
  const crackY = parts.handAnchor.y + crackPt.y * lashLength;
  parts.sonicRing.position.set(crackX, crackY, 5);
  parts.acousticRing.position.set(crackX, crackY, 2);
  // 贴地涡对齐音爆点下方：气流是被激波压下去搅起的。
  parts.vortex.position.x = crackX;

  const peakSpeed = tipPeakSpeed();

  // ④ 火花末梢：quarks 表达音爆瞬间从梢端崩出的火星。
  // 降档只减这里的粒子预算（count 走 hub 的档位缩放），
  // **链段数不参与缩放**——它是签名①的载体。
  const hub = createParticleHub(res.group, ctx.quality);
  const sparkPos = new THREE.Vector3(crackX, crackY, 8);
  const sparks = hub.emit({
    count: 120,
    lifetime: [0.12, 0.46],
    speed: [short * 0.4, short * 1.5],
    size: [1.3, 3.4],
    color: new THREE.Color('#FFD48A'),
    shape: 'sphere',
    spread: short * 0.012,
    position: sparkPos,
    looping: true,
    rate: 0,
  });
  // 锚点：hub.update() 会把 emitter 摘出场景树，
  // 「火花从梢端崩出」只能靠场景自持的具名节点取证。
  const sparkAnchor = new THREE.Object3D();
  sparkAnchor.name = 'spark-anchor';
  sparkAnchor.position.copy(sparkPos);
  res.group.add(sparkAnchor);

  // ⑥ 残影段采样的关节序号：稀疏铺满整链。
  const ghostJoints: number[] = [];
  for (let i = 0; i < GHOST_SEGMENTS; i += 1) {
    ghostJoints.push(Math.round(((i + 1) / GHOST_SEGMENTS) * CHAIN_SEGMENTS));
  }

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, WHIP_ACT1_END, WHIP_ACT2_END);
      // 音爆后经过的秒数：阻尼摆动的唯一自变量。
      const sinceCrack = (t - crackAt) * WHIP_SPAN_S;
      const cracked = t >= crackAt;

      // ⑥ 阻尼摆动：转角施加在枢轴上，鞭身与残影整体跟着摆。
      // 指数衰减在 swayAngle 内，这里不做任何额外的逐帧累加。
      swayRig.rotation.z = swayAngle(sinceCrack);

      // ① 鞭身：逐段定位到闭式解出的关节之间（不逐帧累加姿态）。
      for (let i = 0; i < CHAIN_SEGMENTS; i += 1) {
        const a = segmentPos(i, t);
        const b = segmentPos(i + 1, t);
        const mesh = lash[i];
        mesh.position.set(((a.x + b.x) / 2) * lashLength, ((a.y + b.y) / 2) * lashLength, 4);
        mesh.rotation.z = segmentAngle(i, t);
        // 段亮度跟着该段的速度：波经过时一段段亮起来（能量可见地传过去）。
        const localSpeed = jointSpeed(i + 1, t) / peakSpeed;
        mesh.material.opacity = Math.min(1, 0.35 + act1 * 0.4 + localSpeed * 0.55);
      }

      // ② 鞭梢光点：跟着梢端关节，亮度随梢速，音爆瞬间过曝。
      const tip = segmentPos(CHAIN_SEGMENTS, t);
      const tipNorm = tipSpeed(t) / peakSpeed;
      const crackFlash = cracked ? Math.exp(-Math.max(0, sinceCrack) * 22) : 0;
      // 梢光点在枢轴外，需自行叠上摆动转角。
      const sway = swayAngle(sinceCrack);
      const cos = Math.cos(sway);
      const sin = Math.sin(sway);
      const tipLocalX = tip.x * lashLength;
      const tipLocalY = tip.y * lashLength;
      parts.tipGlow.position.set(
        parts.handAnchor.x + tipLocalX * cos - tipLocalY * sin,
        parts.handAnchor.y + tipLocalX * sin + tipLocalY * cos,
        6,
      );
      parts.tipGlow.material.opacity = Math.min(1, tipNorm * 0.85 + crackFlash * 0.9);
      parts.tipGlow.scale.setScalar(0.5 + tipNorm * 0.9 + crackFlash * 1.4);

      // ③ 音爆环：只在音爆之后存在，从梢的音爆位置外扩。
      const ringAge = cracked ? Math.min(1, sinceCrack / 0.42) : 0;
      parts.sonicRing.material.uniforms.uProgress.value = ringAge;
      parts.sonicRing.material.uniforms.uAlpha.value = cracked
        ? Math.sin(Math.min(1, ringAge) * Math.PI) * 0.95
        : 0;

      // ⑤ 鞭声纹：与激波同源点但跑得更远、衰减更慢（声波 vs 激波）。
      const acousticAge = cracked ? Math.min(1, sinceCrack / 0.68) : 0;
      parts.acousticRing.material.uniforms.uProgress.value = acousticAge;
      parts.acousticRing.material.uniforms.uAlpha.value = cracked
        ? (1 - acousticAge) * 0.6
        : 0;

      // ⑦ 手部剪影：扬鞭时前推，音爆后随摆动微颤（幅度用衰减包络）。
      parts.hand.material.opacity = Math.min(0.9, 0.25 + act1 * 0.6);
      parts.hand.rotation.z = -0.3 + act1 * 0.5 + swayAngle(sinceCrack) * 0.35;
      parts.hand.scale.setScalar(1 + crackFlash * 0.12);

      // ⑧ 搅动气流：音爆后被激波压出的贴地涡，强度随摆动包络退去。
      parts.vortex.material.uniforms.uTime.value = seconds;
      parts.vortex.material.uniforms.uSwirl.value = cracked
        ? Math.min(1.4, sinceCrack * 2.6)
        : 0;
      parts.vortex.material.uniforms.uAlpha.value = cracked
        ? Math.min(0.7, (swayEnvelope(sinceCrack) / swayEnvelope(0)) * 0.75)
        : Math.min(0.18, act1 * 0.18);

      // ⑥ 续 残影段：滞后于本体一小步，透明度随摆动包络退去。
      const ghostLag = 0.035;
      for (let i = 0; i < GHOST_SEGMENTS; i += 1) {
        const joint = ghostJoints[i];
        const pastT = Math.max(0, t - ghostLag * (1 + i / GHOST_SEGMENTS));
        const p = segmentPos(joint, pastT);
        const ghost = ghosts[i];
        ghost.position.set(p.x * lashLength, p.y * lashLength, 3);
        ghost.rotation.z = segmentAngle(Math.min(CHAIN_SEGMENTS - 1, joint), pastT);
        const envNorm = cracked ? swayEnvelope(sinceCrack) / swayEnvelope(0) : 0;
        ghost.material.opacity = cracked
          ? envNorm * 0.4 * (1 - i / (GHOST_SEGMENTS * 1.6))
          : Math.min(0.3, act1 * 0.3 * (1 - i / (GHOST_SEGMENTS * 1.6)));
      }

      // ④ 火花末梢：音爆瞬间从梢的音爆位置崩出，之后迅速停发。
      if (sparks) {
        sparks.emitter.position.copy(sparkPos);
        sparks.emissionOverTime = new ConstantValue(
          cracked ? Math.max(0, 900 * Math.exp(-Math.max(0, sinceCrack) * 14)) : 0,
        );
      }

      // 收尾：第三幕末鞭身整体淡出，但不突然归零（摆动残余仍在）。
      const fade = act3 > 0 ? 1 - act3 * 0.55 : 1;
      for (const mesh of lash) mesh.material.opacity *= fade;
      parts.tipGlow.material.opacity *= fade;
      void act2;
    },

    dispose(): void {
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'bullwhip',
    title: '甩鞭',
    elements: ['鞭身', '鞭梢光点', '音爆环', '火花末梢', '鞭声纹', '阻尼摆动', '手部剪影', '搅动气流'],
    signature: '唯一"链段+音爆"物理；阻尼摆动衰减全库唯一',
    preset: 'whip-crack',
  },
  createBullwhipStage,
);

export { createBullwhipStage };
