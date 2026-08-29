/**
 * 场景 28 bomb（explode · 爆破，1200ms）。
 *
 * 三幕（规格 §4.2 场景 28）：
 * - 0–300ms   引信预燃 + 弹体微颤
 * - 300–750ms 火球 / 冲击波 / 浓烟 / 碎片四层同步爆开
 * - 750–1200ms 蘑菇云升腾 + 灰烬雨 + 地面焦圈
 *
 * 互动：①冲击波跑得比火球快，追上后把火球压扁；②碎片穿过浓烟，
 * 穿烟数直接喂给烟体 shader 的 uGaps 挖出烟隙；③灰烬雨的出发线锁在
 * 蘑菇云顶，云升则落点跟着上移。三者都读同一份运行时真值，耦合是真的。
 *
 * 独立签名：**四层同爆**——火/波/烟/片在第二幕同一时刻起跳，
 * 全库其余场景都是单主体演进，只有这里四层并行且互相干涉。
 *
 * 元素搭建在 ./bomb-parts，碎片刚体在 ./bomb-shrapnel，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildBombParts } from './bomb-parts';
import { createShrapnelField } from './bomb-shrapnel';

/** 三幕边界（归一化，对应 1200ms）。 */
const ACT1_END = 300 / 1200;
const ACT2_END = 750 / 1200;

function createBombStage(ctx: CgStageContext): CgStage {
  const parts = buildBombParts(ctx);
  const { res, blast, groundY } = parts;
  const shrapnel = createShrapnelField(res, ctx, blast, groundY);

  // 粒子层：引信火星、火球卷动的燃屑、烟柱上升的灰烟。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 26,
    lifetime: [0.2, 0.5],
    speed: [blast * 0.3, blast * 0.8],
    size: [1.5, 3.5],
    color: new THREE.Color('#FFD98A'),
    shape: 'cone',
    spread: 0.7,
    position: parts.fuse.position.clone(),
  });
  hub.emit({
    count: 120,
    lifetime: [0.3, 0.85],
    speed: [blast * 1.6, blast * 4.2],
    size: [3, 9],
    color: ctx.color.clone(),
    shape: 'sphere',
    spread: blast * 0.5,
  });
  hub.emit({
    count: 70,
    lifetime: [0.6, 1.2],
    speed: [blast * 0.5, blast * 1.5],
    size: [8, 22],
    color: new THREE.Color('#6B655C'),
    shape: 'cone',
    spread: 0.5,
  });

  let lastNow = ctx.now;
  const smokeBox = new THREE.Box3();

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, ACT1_END, ACT2_END);
      const live = 1 - act3;

      // ① 引信 + 弹体微颤：起爆瞬间壳体消失，火花随之熄灭。
      const intact = act2 <= 0 ? 1 : 0;
      parts.shell.material.opacity = intact;
      parts.shell.position.x = intact ? Math.sin(seconds * 46) * blast * 0.035 * act1 : 0;
      parts.shell.position.y = intact ? Math.cos(seconds * 39) * blast * 0.03 * act1 : 0;
      parts.fuse.material.opacity = intact * (0.45 + Math.abs(Math.sin(seconds * 14)) * 0.55) * act1;
      parts.fuse.scale.setScalar(intact ? 0.6 + act1 * 0.8 : 0.001);

      // ⑥ 全屏闪光：第二幕头段一记白闪，随后急落。
      const flashCurve = Math.max(0, 1 - Math.pow(act2 * 2.6, 1.7));
      parts.flash.material.opacity = act2 > 0 ? flashCurve * 0.92 : 0;

      // ③ 冲击波：从火球内部起步，加速冲出后跑得比火球快，
      // 第二幕末触达四缘（全屏要求）。指数 >1 才有「先被火球包住、后反超」
      // 的窗口，开根号会让波一开始就在外面，互动①就无从发生。
      const reach = Math.hypot(ctx.width, ctx.height) * 0.62;
      const waveRadius = blast * 0.18 + Math.pow(act2, 1.35) * reach;
      parts.shockwave.scale.setScalar(Math.max(0.001, waveRadius / parts.shockOuter));
      parts.shockwave.material.opacity = act2 > 0 ? Math.pow(1 - act2, 1.3) * 0.7 * live : 0;

      // ② 火球：膨胀 + 自转卷动；互动① 由波面是否已越过火球面决定压扁量。
      const fireRadius = blast * (0.35 + Math.pow(act2, 0.5) * 1.05);
      const overtake = Math.max(0, Math.min(1, (waveRadius - fireRadius) / (blast * 1.6)));
      const squash = overtake * 0.55;
      const fireScale = act2 > 0 ? fireRadius / (blast * 0.62) : 0.001;
      parts.fireball.scale.set(
        fireScale * (1 + squash * 0.45),
        fireScale * (1 - squash),
        fireScale,
      );
      parts.fireball.rotation.set(seconds * 1.4, seconds * 1.9, 0);
      parts.fireball.material.opacity = act2 > 0 ? Math.pow(1 - act2 * 0.75, 1.4) * live : 0;

      // ⑦ 压力变形：随冲击波强度起皱，第三幕退去。
      parts.warp.uniforms.uTime.value = seconds;
      parts.warp.uniforms.uStrength.value = Math.pow(act2, 0.7) * (1 - act2 * 0.35) * live * 1.1;

      // ④ 浓烟蘑菇云：第二幕成形，第三幕升腾并继续膨胀。
      const smokeMaterial = parts.smoke.material;
      smokeMaterial.uniforms.uTime.value = seconds;
      smokeMaterial.uniforms.uDensity.value = Math.min(1, act2 * 1.25) * (1 - act3 * 0.25);
      smokeMaterial.uniforms.uRise.value = act2 * 0.4 + act3 * 1.2;
      const smokeScale = 0.28 + Math.min(1, act2 * 1.1) * 0.62 + act3 * 0.34;
      parts.smoke.scale.setScalar(act2 > 0 ? smokeScale : 0.001);
      // 柄底钉在爆心，冠部向上长：位置随高度一起抬，云才占「上」半屏。
      parts.smoke.position.y = (act2 > 0 ? ctx.height * 0.62 * smokeScale * 0.5 : 0) + act3 * blast * 0.9;

      // ⑤ 碎片：第二幕起爆后交给刚体自行演化。
      if (act2 > 0) shrapnel.detonate();
      shrapnel.update(delta);
      shrapnel.setOpacity(act2 > 0 ? Math.min(1, act2 * 3) * (1 - act3 * 0.5) : 0);

      // 互动②：穿烟碎片数是几何真值，不是估算——烟隙因此与碎片位置同步。
      smokeBox.setFromObject(parts.smoke);
      smokeMaterial.uniforms.uGaps.value = shrapnel.countInside(smokeBox);

      // ⑨ 地面焦圈：第二幕烧出，第三幕留痕渐淡。
      parts.scorch.material.opacity = Math.min(1, act2 * 1.6) * (1 - act3 * 0.4) * 0.7;
      parts.scorch.scale.set(0.5 + act2 * 0.7 + act3 * 0.1, 0.5 + act2 * 0.7 + act3 * 0.1, 0.34);

      // ⑧ 互动③：灰烬雨从云顶落下，出发线锁在实测云顶。
      const cloudTop = act2 > 0 ? smokeBox.max.y : 0;
      const fallSpan = Math.max(1, cloudTop - parts.ashFloorY);
      for (const flake of parts.ash) {
        const travel = (flake.phase + act3 * flake.rate * 1.3) % 1;
        flake.mesh.position.set(
          flake.x + Math.sin(seconds * flake.spin + flake.phase * 9) * blast * 0.09,
          cloudTop - travel * fallSpan,
          0,
        );
        flake.mesh.rotation.z = seconds * flake.spin;
      }
      // 共用一份材质：灰烬是整体氛围层，逐片调透明度没有视觉收益。
      const ashMaterial = parts.ash[0]?.mesh.material as THREE.MeshBasicMaterial | undefined;
      if (ashMaterial) ashMaterial.opacity = Math.pow(act3, 0.6) * 0.75;
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      shrapnel.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'bomb',
    title: '爆破',
    elements: [
      '引信火花', '火球', '冲击波球环', '浓烟蘑菇云', '碎片',
      '全屏闪光', '压力变形', '灰烬雨', '地面焦圈',
    ],
    signature: '唯一"四层同爆"（火/波/烟/片）；与 fireworks（优美）形成"毁灭"对照',
    preset: 'explode',
  },
  createBombStage,
);

export { createBombStage };
