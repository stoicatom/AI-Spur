/**
 * 场景 26 axe（impact · 斩斧破木，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 26。本文件只做编排：把
 * `./axe-split`（斧刃轨迹 → 裂纹 → 分离时刻）、`./axe-segments`（分离后的
 * 木段运动学）、`./axe-impact`（弧光/木屑/震荡/回弹）三个纯数学模块的输出
 * 接到 `./axe-parts` 建好的元素上。
 *
 * 签名「原木分段分离」的可验收出口在这里合流：每段读**自己的**
 * `segmentSplitAt(i)`，六段各在不同时刻分离、各自亮起断口——这与
 * katana（切面滑过，切口恒等于刀锋位置、断面沿切向滑走）是两条不同的
 * 力学，不是同一条曲线换个名字。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub, scaledCount } from '../cg-particle-kit';
import { materialIdentityFor } from '../material-identity';
import { buildAxeParts } from './axe-parts';
import {
  AXE_ACT1_END,
  AXE_ACT2_END,
  AXE_SEGMENT_COUNT,
  bladeY,
  crackReach,
  segmentSplitAt,
} from './axe-split';
import {
  segmentGlow,
  segmentOpen,
  segmentResin,
  segmentSide,
  segmentSpin,
} from './axe-segments';
import {
  arcGlow,
  axeRebound,
  chipBurst,
  chipSeat,
  shockRadius,
  shockWave,
} from './axe-impact';

/** 固定物理步长（秒）：粒子时间由场景时间轴折算，不吃 frameDelta。 */
const FIXED_DT = 1 / 60;
/** 整幕时长（秒），把归一化进度折算成物理时间。 */
const SPAN_S = 1.2;

function createAxeStage(ctx: CgStageContext): CgStage {
  const parts = buildAxeParts(ctx);
  const { res, blade, axeRig, segments, arc, shock, resins, chipAnchor } = parts;
  const { logHalf, segThickness, short, strike } = parts;

  // 物理档案取 axe 行：restitution 定回弹幅度，mass 定木屑初速的量级。
  // force 是类型枚举（'recoil'），不能当乘数用。
  const identity = materialIdentityFor('axe', 'impact', ctx.params);
  const { restitution, mass } = identity.physical;

  const quality = ctx.quality === 'auto' ? 'medium' : ctx.quality;
  const hub = createParticleHub(res.group, quality);

  // ③ 木屑：持续发射层，位置每帧跟着裂纹前沿走（见 chipSeat）。
  // 木屑是「量大而单调的颗粒」，降档减它的密度（设计规格 §3.1）；
  // 六个木段是签名载体，数量不过 scaledCount。
  const chipColor = ctx.color.clone().lerp(new THREE.Color('#D8B27A'), 0.78);
  const chips = hub.emit({
    count: 46,
    lifetime: [0.18, 0.52],
    speed: [short * 0.5, short * 1.5 * Math.min(2, mass / 2)],
    size: [short * 0.006, short * 0.017],
    color: chipColor,
    shape: 'cone',
    spread: 0.72,
    position: strike.clone(),
    looping: true,
    rate: 0,
  });
  const chipRate = scaledCount(46, quality) * 26;

  // 震尘：落地震荡扬起的一层细尘，独立于木屑（不同来源、不同时刻）。
  const dust = hub.emit({
    count: 24,
    lifetime: [0.3, 0.7],
    speed: [short * 0.12, short * 0.4],
    size: [short * 0.01, short * 0.026],
    color: ctx.color.clone().lerp(new THREE.Color('#9C8A6E'), 0.8),
    shape: 'cone',
    spread: 1.25,
    position: new THREE.Vector3(strike.x, parts.groundY, 0),
    looping: true,
    rate: 0,
  });
  const dustRate = scaledCount(24, quality) * 12;

  let lastNow = ctx.now;
  // 粒子时间由场景进度折算，稀疏 update 与密集 update 同结果。
  let particleT = 0;

  return {
    update(t: number, now: number, runtimeQuality): void {
      if (res.disposed) return;
      void runtimeQuality;
      void frameDelta(now, lastNow);
      lastNow = now;

      const [act1, act2, act3] = acts(t, AXE_ACT1_END, AXE_ACT2_END);
      const k = Math.min(1, Math.max(0, t));

      // 粒子按场景时间轴推进固定步长：不吃真实帧间隔。
      const targetT = k * SPAN_S;
      while (particleT + FIXED_DT <= targetT) {
        hub.update(FIXED_DT);
        particleT += FIXED_DT;
      }
      // 折算后的粒子时钟挂到锚点上供断言：quarks 的 ParticleSystem 在测试
      // 环境（根节点非 THREE.Scene）里首帧就自毁，内部 time 观测不到，粒子
      // 时钟「由场景进度折算而非 update 次数决定」这条硬约束因此没有别的
      // 可观测出口。
      chipAnchor.userData.particleT = particleT;

      // ① 斧身：位置直接由 bladeY 驱动，⑦ 回弹叠加在 rig 上。
      const bladeUnit = bladeY(k);
      const edge = arcGlow(k);
      blade.position.y = strike.y + bladeUnit * short * 0.34 + short * 0.22;
      blade.material.uniforms.uAlpha.value = Math.min(1, act1 * 4 + 0.15);
      blade.material.uniforms.uEdge.value = edge;
      // ⑦ 回弹斧身：行程走完后木料把斧顶回来一点，带一次过冲。
      axeRig.position.y = axeRebound(k, restitution) * short * 0.34;

      // ④ 斧光弧：亮度 = 斧刃速率，斧停则灭。
      arc.material.opacity = edge * 0.9;
      arc.position.y = blade.position.y - short * 0.1;

      // ② 原木 + ⑥ 断口发光 + ⑧ 松脂：逐段读自己的分离时刻。
      for (let i = 0; i < AXE_SEGMENT_COUNT; i += 1) {
        const seg = segments[i];
        const splitAt = segmentSplitAt(i);
        const split = Number.isFinite(splitAt) && k > splitAt ? 1 : 0;
        const open = segmentOpen(i, k);
        // 沿裂面法向张开：分侧读 segmentSide（与翻滚方向同一个定义）。
        const side = segmentSide(i);
        seg.mesh.position.y = seg.base.y + side * open * segThickness;
        seg.mesh.rotation.z = segmentSpin(i, k);
        const uniforms = seg.mesh.material.uniforms;
        uniforms.uAlpha.value = Math.min(1, act1 * 4 + 0.2);
        uniforms.uSplit.value = split;
        uniforms.uGlow.value = segmentGlow(i, k);
      }

      // 未劈的左段：始终不亮断口，作为「还连着」的参照。
      const crack = crackReach(k);
      const stub = res.group.getObjectByName('log-stub') as
        THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | undefined;
      if (stub) {
        stub.material.uniforms.uAlpha.value = Math.min(1, act1 * 4 + 0.2);
        // 左段整幕不分离，但裂纹一旦起步，它靠落刃点那侧也被挤裂一点。
        stub.material.uniforms.uSplit.value = 0;
        stub.material.uniforms.uGlow.value = crack > 0 ? 0.12 : 0;
      }

      // ⑧ 松脂星点：挂在所属段的断面上，随该段一起走。
      for (const star of resins) {
        const seg = segments[star.segment];
        const open = segmentOpen(star.segment, k);
        const side = segmentSide(star.segment);
        star.mesh.position.set(
          seg.base.x + star.offset * segThickness,
          parts.strike.y + seg.base.y + side * (open * segThickness - segThickness * 0.4),
          12,
        );
        star.mesh.material.opacity = segmentResin(star.segment, k);
      }

      // ③ 木屑：发射点随裂纹前沿推进（不是固定坑）。
      const burst = chipBurst(k);
      const seat = chipSeat(k);
      const chipX = strike.x + seat * (logHalf - strike.x);
      chipAnchor.position.set(chipX, strike.y, 0);
      if (chips) {
        chips.emitter.position.set(chipX, strike.y, 0);
        chips.emissionOverTime = new ConstantValue(burst * chipRate);
      }

      // ⑤ 落地震荡：以行程走完为原点，严格晚于触木。
      const wave = shockWave(k);
      shock.material.uniforms.uAlpha.value = wave;
      shock.material.uniforms.uRadius.value = shockRadius(k);
      shock.material.uniforms.uTime.value = k * 2.4;
      if (dust) dust.emissionOverTime = new ConstantValue(wave * dustRate);

      // 第三幕：震尘落定，整场收光（斧留在木料里，不淡出斧身）。
      const fade = 1 - act3 * 0.55;
      arc.material.opacity *= fade;
      void act2;
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
    packId: 'axe',
    title: '斩斧破木',
    elements: ['斧 mesh', '原木', '木屑', '斧光弧', '落地震荡', '木纹断口发光', '回弹斧身', '松脂星点'],
    signature: '唯一"劈裂木料"场景；原木分段分离全库唯一',
    preset: 'impact',
  },
  createAxeStage,
);

export { createAxeStage };
