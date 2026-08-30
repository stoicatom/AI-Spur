/**
 * 场景 11 thunder（shock-ring · 雷击山谷，1200ms）。
 *
 * 三幕（规格 §4.2 场景 11）：
 * - 0–200ms    蓄雷（云内频闪加密，谷底压暗）
 * - 200–800ms  地裂 + 冲击波 + 碎石
 * - 800–1200ms 回响尾迹 + 尘落
 *
 * 互动：①**冲击波扫过碎石将其抛起**——每块碎石的起跳时刻是环波前沿
 * 抵达它所在半径的解（thunder-shock 的 ringArrivalT），不是定时器；
 * 改声速或碎石位置，起跳次序会一起变。②**扬尘跟着环波走**——尘的发射点
 * 半径逐帧取当帧前沿半径，环走多远尘就扬到多远。
 *
 * 独立签名：**贴地环波**——波是一圈躺在地面上的椭圆（scale.y 只有
 * scale.x 的 0.26），以恒定声速线性外扩直到抵达四缘。与 lightning 的
 * 「天穹电弧」构成天地对照：那边是纵向劈落的三相放电，这边全部动作
 * 都发生在地面线上，整幕没有一道横贯天穹的主电弧。
 *
 * 元素搭建在 ./thunder-parts，纯数学在 ./thunder-shock，
 * 刚体在 ./thunder-rubble，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildThunderParts } from './thunder-parts';
import { createRubbleField } from './thunder-rubble';
import {
  THUNDER_ACT1_END, THUNDER_ACT2_END, crackReveal, echoRadius,
  shockRadius, shockSpeedFor, skyStrobe,
} from './thunder-shock';

export { THUNDER_ACT1_END, THUNDER_ACT2_END };

/** 冷凝雾带滞后波前的比例：超压过后气压才骤降，雾在波后凝出。 */
const MIST_LAG = 0.82;

function createThunderStage(ctx: CgStageContext): CgStage {
  const parts = buildThunderParts(ctx);
  const { res, crack, rings, echoes, dustAnchors, ridges, skyCloud, strobe, mists } = parts;
  const { groundY, ringHalfSpan, reach, scale } = parts;
  const { width, height } = ctx;
  const short = Math.min(width, height);
  const speed = shockSpeedFor(width, height);

  // ④ 碎石（规格元素④）：真刚体，被环波前沿逐块扫起。
  const rubble = createRubbleField(res, ctx, groundY, reach, speed);

  // ⑤ 扬尘（规格元素⑤）：贴地尘拖尾，发射点跟着环波走。
  // 几何贴片表达不了被掀起的尘团，交给 quarks；档位与释放由工具层管。
  const hub = createParticleHub(res.group, ctx.quality);
  const dustJets = dustAnchors.map(() => hub.emit({
    count: 26,
    lifetime: [0.35, 0.95],
    speed: [short * 0.12, short * 0.5],
    size: [scale * 0.5, scale * 1.7],
    color: new THREE.Color('#9DA6B8'),
    shape: 'cone',
    spread: 1.15,
    position: new THREE.Vector3(0, groundY, 16),
    looping: true,
    rate: 0,
  }));

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, THUNDER_ACT1_END, THUNDER_ACT2_END);
      // 签名量：主环（第 0 层）的前沿半径。全场因果都挂在它身上。
      const front = shockRadius(t, 0, speed);

      // ⑦ 天空暗闪：高频频闪，蓄雷幕最烈，末幕熄。
      const strobeLevel = skyStrobe(t);
      strobe.material.opacity = strobeLevel * 0.5;
      skyCloud.material.uniforms.uTime.value = seconds;
      skyCloud.material.uniforms.uDensity.value = Math.min(1, 0.35 + act1 * 0.6) * (1 - act3 * 0.45);
      skyCloud.material.uniforms.uFlash.value = strobeLevel * 0.85;

      // ① 地裂雷光：第一幕不见，起爆后从震中往两侧撕开。
      const reveal = crackReveal(t, speed, width * 0.65);
      crack.material.uniforms.uReveal.value = reveal;
      crack.material.uniforms.uFlicker.value = strobeLevel;
      // 撕开中最亮，末幕余烬。
      crack.material.uniforms.uAlpha.value = reveal > 0
        ? Math.min(1, reveal * 2.2) * (1 - act3 * 0.72) * 0.95
        : 0;

      // ② 环形冲击波：多层错峰、线性外扩、贴地椭圆。
      for (const layer of rings) {
        const u = layer.mesh.material.uniforms;
        const r = shockRadius(t, layer.index, speed);
        if (r <= 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        u.uRadius.value = r / ringHalfSpan;
        // 能量随半径摊在更长的圆周上：越远越淡，出屏后收尾。
        const spread = 1 / (1 + (r / reach) * 1.25);
        const tail = Math.max(0, 1 - Math.max(0, r / reach - 1) / 0.6);
        u.uAlpha.value = spread * tail * (layer.index === 0 ? 1 : 0.62) * 1.15;
        // 波前随外扩变厚（高频先衰减）。
        u.uThickness.value = 0.018 + (r / reach) * 0.05;
      }

      // ③ 山谷回响尾迹：前沿撞谷壁后**向内回传**的那一支，半径递减。
      for (let i = 0; i < echoes.length; i += 1) {
        const u = echoes[i].material.uniforms;
        // 两壁距离略有差异，两支回响错开一点。
        const wall = reach * (1 + i * 0.14);
        const back = echoRadius(front, wall);
        if (back < 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        u.uRadius.value = back / ringHalfSpan;
        // 末幕是回响的主场；能量随回传路程继续衰减。
        u.uAlpha.value = (0.22 + act3 * 0.85) * (back / wall) * (i === 0 ? 1 : 0.7);
      }

      // ⑧ 空气冷凝纹：跟在波后的一圈白纹（前沿的滞后解）。
      for (let i = 0; i < mists.length; i += 1) {
        const u = mists[i].material.uniforms;
        const lag = front * MIST_LAG * (1 - i * 0.16);
        u.uTime.value = seconds;
        u.uRadius.value = lag / ringHalfSpan;
        // 起爆后凝出、末幕随尘一起散。
        u.uAlpha.value = lag > 0
          ? Math.min(1, act2 * 1.6 + act3 * 0.5) * (1 - act3 * 0.62) * (0.62 - i * 0.14)
          : 0;
      }

      // ⑥ 远山剪影：整幕在场（背景），被环波掠过时轮廓被照亮。
      for (let i = 0; i < ridges.length; i += 1) {
        const u = ridges[i].material.uniforms;
        u.uAlpha.value = 0.55 + act1 * 0.4;
        // 越远的山越晚被照亮：波要走更久才扫到它。
        const wall = reach * (0.75 + i * 0.2);
        u.uRim.value = Math.max(0, 1 - Math.abs(front - wall) / (reach * 0.3))
          * (0.4 + strobeLevel * 0.7);
      }

      // ④ 互动①：碎石被冲击波扫过时抛起。物理由场景时间轴驱动，
      // 追赶循环内逐步重采样波前——起跳时刻因此是波到的解，不是定时器。
      rubble.advanceTo(t);
      rubble.setOpacity(Math.min(1, act1 * 2) * (1 - act3 * 0.35));

      // ⑤ 互动②：扬尘跟着环波走。发射点半径 = 当帧前沿半径，
      // 锚点与 emitter 同步写（emitter 会被 BatchedRenderer 摘出场景树，
      // 按名字定位不到，验收量锚点）。
      const dusting = front > 0 && front < reach * 1.5 ? 1 : 0;
      for (let i = 0; i < dustAnchors.length; i += 1) {
        const anchor = dustAnchors[i];
        const x = Math.cos(anchor.angle) * front;
        const z = Math.sin(anchor.angle) * front * 0.34;
        anchor.node.position.set(x, groundY, z);
        const jet = dustJets[i];
        if (!jet) continue;
        jet.emitter.position.set(x, groundY, z);
        // 环出屏后停发，尾幕让已有尘粒自行落定（规格「尘落」）。
        jet.emissionOverTime = new ConstantValue(dusting * (34 + act2 * 46) * (1 - act3 * 0.85));
      }
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      rubble.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'thunder',
    title: '雷击山谷',
    elements: [
      '地裂雷光', '环形冲击波', '山谷回响尾迹', '碎石跳起',
      '扬尘', '远山剪影', '天空暗闪', '空气冷凝纹',
    ],
    signature: '唯一"贴地环波"；与 lightning 的"天穹电弧"形成天地对照',
    preset: 'shock-ring',
  },
  createThunderStage,
);

export { createThunderStage };
