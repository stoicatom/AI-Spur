/**
 * 场景 27 spear（dash · 破空长矛，1200ms）。
 *
 * 三幕（规格 §4.2 场景 27）：
 * - 0–250ms    掷出（矛在手，蓄势）
 * - 250–800ms  飞行 + 螺旋气流
 * - 800–1200ms 命中 + 裂纹 + 气流断
 *
 * 互动：①**螺旋气流在发射加速段收束**——收束半径是 `spiralRadiusScale(speed)`，
 * 只吃当帧来流速度，于是加速段（前 45% 飞行段）半径单调收紧、巡航减速段
 * 又回张，且同速度必同半径；②**命中时气流断裂**——`airflowContinuity(t, hitAt)`
 * 是唯一真值，同时决定螺旋半径的暴张与气流亮度，命中点换个时刻断裂点跟着走。
 *
 * 独立签名：**唯一「螺旋气流加持的直飞」**。
 * - 与 ninja-star（同为投掷）相反：那边是回旋轨迹，这里的横向自由度全部
 *   绑在绕杆相位上，杆轴方向没有任何摆动项——矛路逐帧位移共线且不返回起点。
 * - 与 bow（同为 dash 投掷物）相反：bow 的箭全程减速（1-exp，二阶差分恒负），
 *   spear 有**发射加速段**（分段线性速度剖面，前段二阶差分为正）。
 *
 * 弹道与驻波数学在 ./spear-flight，螺旋涡管在 ./spear-swirl，
 * 杆身驻波与尘云撕裂在 ./spear-shaft，元素搭建在 ./spear-parts，
 * 本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildSpearParts, FLEX_BEADS } from './spear-parts';
import { TEAR_SEGMENTS } from './spear-shaders';
import {
  HIT_AT,
  LAUNCH_END,
  airflowContinuity,
  spearPassTime,
  spearProgress,
  spearSpeed,
  swirlSpin,
} from './spear-flight';
import { shaftDisplacement, tearWidth } from './spear-shaft';

/** 第一幕结束点（250/1200）。 */
export const SPEAR_ACT1_END = LAUNCH_END;
/** 第二幕结束点（800/1200）。 */
export const SPEAR_ACT2_END = HIT_AT;

function createSpearStage(ctx: CgStageContext): CgStage {
  const parts = buildSpearParts(ctx);
  const { res, fromX, toX, pathY, spearLength, dustSize } = parts;
  const { width, height } = ctx;
  const short = Math.min(width, height);
  const span = toX - fromX;

  // 雾化细尘：quarks 表达「被涡管甩出的碎尘」，与可寻址螺旋骨架互补。
  const hub = createParticleHub(res.group, ctx.quality);
  const mistPos = new THREE.Vector3(fromX, pathY, 4);
  const mist = hub.emit({
    count: 96,
    lifetime: [0.18, 0.55],
    speed: [short * 0.25, short * 1.05],
    size: [1.4, 3.6],
    color: new THREE.Color('#DCEBFF'),
    shape: 'cone',
    spread: 0.55,
    position: mistPos,
    looping: true,
    rate: 70,
  });
  // 锚点：quarks 的 emitter 会被 hub.update() 摘出场景树，
  // 「气流跟着矛」只能靠场景自持的具名节点取证。
  const mistAnchor = new THREE.Object3D();
  mistAnchor.name = 'mist-anchor';
  res.group.add(mistAnchor);

  // 尘云各段的「矛经过时刻」：构建期一次算好，运行期只查表。
  // 「裂口跟着矛走」因此是数据依赖，不是各段自己定时。
  const segmentPassAt: number[] = [];
  for (let i = 0; i < TEAR_SEGMENTS; i += 1) {
    // 段中心在贴片 UV 的 x → 换算成弹道进度。
    const uvX = i / (TEAR_SEGMENTS - 1);
    const worldX = (uvX - 0.5) * dustSize.x;
    segmentPassAt.push(spearPassTime((worldX - fromX) / span));
  }
  const puffPassAt = parts.puffs.map((_, i) =>
    spearPassTime(0.16 + (i / parts.puffs.length) * 0.74));

  const tearArray = parts.dust.material.uniforms.uTear.value as Float32Array;
  // 矛路在尘云贴片上的 v 坐标（贴片已对齐 pathY，所以是正中）。
  parts.dust.material.uniforms.uPathY.value = 0.5;
  // 命中点在靶板 UV：矛路正对板心。
  (parts.board.material.uniforms.uHit.value as THREE.Vector2).set(0.5, 0.5);

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, SPEAR_ACT1_END, SPEAR_ACT2_END);
      const progress = spearProgress(t);
      const speed = spearSpeed(t);
      const continuity = airflowContinuity(t);
      // 枪尖 x：弹道是**直线**——只有沿 x 一个自由度，没有任何横向项。
      const tipX = fromX + span * progress;

      // ① 矛 mesh：整体沿弹道平移，姿态恒定（直飞，不像 ninja-star 打转）。
      parts.spear.position.set(tipX - spearLength * 0.37, pathY, 12);
      parts.head.material.opacity = 0.55 + act1 * 0.45;
      parts.shaft.material.opacity = 0.5 + act1 * 0.4;

      // ⑤ 矛杆震动：驻波采样珠。首末珠是波节，位移恒零。
      for (let i = 0; i < FLEX_BEADS; i += 1) {
        const alongNorm = i / (FLEX_BEADS - 1);
        // 局部 x：0 → 枪头端，1 → 尾镦端（矛沿 +x 指，所以尾镦在 -x）。
        const localX = spearLength * (0.37 - alongNorm * 0.94);
        const flex = shaftDisplacement(alongNorm, t) * short * 0.026;
        parts.beads[i].position.set(localX, flex, 1);
        parts.beads[i].material.opacity = Math.abs(flex) > 1e-9
          ? 0.28 + Math.min(0.6, Math.abs(flex) / (short * 0.02) * 0.6)
          : 0;
      }

      // ② 螺旋气流：绕杆螺旋（互动①收束 / 互动②断裂都在 drive 内）。
      parts.swirl.drive(t, tipX, pathY, (0.25 + act2 * 0.75) * (1 - act3 * 0.25));

      // ③ 破空纹：贴矛流线，速度越高纹越密越亮。
      parts.rip.position.set(tipX - spearLength * 0.55, pathY, 6);
      parts.rip.material.uniforms.uSpeed.value = speed;
      parts.rip.material.uniforms.uPhase.value = seconds * 4.2;
      parts.rip.material.uniforms.uAlpha.value = speed > 0 ? 0.32 + speed * 0.68 : 0;

      // ⑧ 枪头闪光：跟着枪尖，命中瞬间过曝一下。
      parts.flare.position.set(tipX, pathY, 16);
      parts.flare.material.uniforms.uSpin.value = swirlSpin(t) * 0.12;
      const hitFlash = act3 > 0 ? Math.exp(-act3 * 9) : 0;
      parts.flare.material.uniforms.uAlpha.value =
        Math.min(1, act1 * 0.45 + speed * 0.5 + hitFlash * 0.9);

      // ⑦ 气流云：各段从「矛经过它」的时刻起被撕开，且**不愈合**（与 bow 相反）。
      parts.dust.material.uniforms.uTime.value = seconds;
      parts.dust.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.4);
      for (let i = 0; i < TEAR_SEGMENTS; i += 1) {
        tearArray[i] = tearWidth(t, segmentPassAt[i]);
      }
      parts.dust.material.uniformsNeedUpdate = true;

      // ⑦ 续 尘团：矛过时被推离路轴，之后继续被涡管带着飘（不回位）。
      for (let i = 0; i < parts.puffs.length; i += 1) {
        const puff = parts.puffs[i];
        const passAt = puffPassAt[i];
        const along = 0.16 + (i / parts.puffs.length) * 0.74;
        const baseX = fromX + span * along;
        const kick = tearWidth(t, passAt);
        const side = i % 2 === 0 ? 1 : -1;
        puff.position.set(
          baseX + kick * short * 0.02,
          pathY + side * (short * 0.03 + kick * short * 0.075),
          -18,
        );
        puff.material.opacity = Math.min(0.5, act1 * 0.16 + kick * 0.3);
      }

      // ⑥ 靶板裂纹：命中后应力前沿外扩，顺纹撕开随之加深。
      parts.board.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.3);
      parts.board.material.uniforms.uFront.value = act3 > 0 ? 0.14 + act3 * 0.9 : 0;
      parts.board.material.uniforms.uImpact.value = hitFlash;
      parts.board.material.uniforms.uGrain.value = act3;

      // ④ 命中震荡：末端环三圈错峰外扩。
      for (let i = 0; i < parts.rings.length; i += 1) {
        const ring = parts.rings[i];
        const delay = i * 0.11;
        const local = Math.max(0, act3 - delay) / Math.max(0.001, 1 - delay);
        ring.material.opacity = local > 0 ? Math.sin(local * Math.PI) * 0.72 : 0;
        ring.scale.setScalar(1 + local * (2.1 + i * 0.85));
      }

      // 雾化细尘：发射点跟着矛尾；气流断裂后发射率骤降（与螺旋同一真值）。
      mistPos.set(tipX - spearLength * 0.5, pathY, 4);
      mistAnchor.position.copy(mistPos);
      if (mist) {
        mist.emitter.position.copy(mistPos);
        mist.emissionOverTime = new ConstantValue(
          speed > 0 ? 24 + speed * 70 * continuity : 2,
        );
      }

      void height;
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
    packId: 'spear',
    title: '破空长矛',
    elements: ['矛 mesh', '螺旋气流', '破空纹', '命中震荡', '矛杆震动', '靶板裂纹', '气流云', '枪头闪光'],
    signature: '唯一"螺旋气流加持的直飞"；与 ninja-star（回旋）同为投掷但轨迹相反',
    preset: 'dash',
  },
  createSpearStage,
);

export { createSpearStage };
