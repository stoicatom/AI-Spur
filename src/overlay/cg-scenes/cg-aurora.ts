/**
 * 场景 30 aurora（wave · 极光绸带，1200ms）。
 *
 * 三幕（规格 §4.2 场景 30）：
 * - 0–250ms    带面成形
 * - 250–900ms  卷舞 + 流光 + 爆发点
 * - 900–1200ms 淡去
 *
 * 互动：①流光照亮带面起伏峰谷——局部亮度是「起伏量 × 流光接近度」
 * 的乘积（见 ribbonLocalGain），流光不到就不亮、平坦处也不亮；
 * ②爆发点处整带亮度提升——整带亮度由 burstEnergy 抬升，爆发不发生
 * 带就只有基础亮度。
 *
 * 独立签名：**唯一「时空绸带」**。与 dragon 同为 wave 物理但媒介
 * 完全不同：dragon 是实体生物蜿蜒（身段长度守恒、关节间距固定），
 * 极光是等离子体幕——带面起伏是**沿带传播的行波**，可任意拉伸翻卷。
 * 验收咬住「行波而非驻波」：同一相位点随时间沿带移动。
 *
 * 元素搭建在 ./aurora-parts，绸带数学在 ./aurora-ribbon。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildAuroraParts } from './aurora-parts';
import { RIBBON_UNIFORM_SEGMENTS } from './aurora-shaders';
import {
  BURST_U,
  burstEnergy,
  glowFlowU,
  ribbonAxisY,
  ribbonFold,
  ribbonLocalGain,
} from './aurora-ribbon';

/** 第一幕结束点（250/1200）。 */
export const AURORA_ACT1_END = 250 / 1200;
/** 第二幕结束点（900/1200）。 */
export const AURORA_ACT2_END = 900 / 1200;

function createAuroraStage(ctx: CgStageContext): CgStage {
  const parts = buildAuroraParts(ctx);
  const {
    res, ribbon, stars, mountain, lake, burst, fringes, flows,
    ribbonWidth, ribbonHeight, ribbonY, scale,
  } = parts;
  const { width, height } = ctx;

  // ② 流动光（粒子层）：几何光点只有 8 个，成片的流光交给 quarks。
  const hub = createParticleHub(res.group, ctx.quality);
  const glowPos = new THREE.Vector3(0, ribbonY, -4);
  const glowSystem = hub.emit({
    count: 120,
    lifetime: [0.4, 1.0],
    speed: [scale * 0.8, scale * 2.6],
    size: [1.5, 4],
    color: new THREE.Color('#CFFFE8'),
    shape: 'cone',
    spread: 0.35,
    position: glowPos,
    looping: true,
    rate: 82,
  });

  // 流光锚点：quarks 的 emitter 会被 BatchedRenderer 摘走，
  // 锚点让「流光沿带走」可定位、可验收。
  const glowAnchor = new THREE.Object3D();
  glowAnchor.name = 'glowflow-anchor';
  res.group.add(glowAnchor);

  const foldArray = ribbon.material.uniforms.uFold.value as Float32Array;
  const gainArray = ribbon.material.uniforms.uGain.value as Float32Array;
  const lakeFold = lake.material.uniforms.uFold.value as Float32Array;
  let lastNow = ctx.now;

  /**
   * 沿带位置换成场景坐标。
   *
   * y = 中轴弧高 + 行波起伏。中轴是缓弧（极光挂在磁层上，中央高两端
   * 垂下），起伏是叠加在它上面的行波——两者相加才是「绸带」而非
   * 一条水平的波浪线。
   */
  function ribbonPoint(u: number, t: number): { x: number; y: number } {
    return {
      x: (u - 0.5) * ribbonWidth,
      // 起伏项与 shader 的 center = 0.5 + fold*0.24 同一换算。
      y: ribbonAxisY(u, height) + ribbonFold(u, t) * ribbonHeight * 0.24,
    };
  }

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, AURORA_ACT1_END, AURORA_ACT2_END);
      const burstLevel = burstEnergy(t);
      const fade = 1 - act3 * 0.85;

      // 流光的当前沿带位置：互动①要用它算局部亮度。
      const glowUs = flows.map((f) => glowFlowU(t, f.u0, f.speed));

      // ① 极光带：逐段写入起伏与局部亮度。
      ribbon.material.uniforms.uTime.value = seconds;
      // 互动② 整带亮度由爆发抬升；基底只留一小层，「提升」因此可测。
      ribbon.material.uniforms.uAlpha.value = (0.3 + burstLevel * 0.7) * Math.min(1, act1 * 1.5) * fade;
      // 成形期带子窄，卷舞期展开。
      ribbon.material.uniforms.uSpread.value = 0.45 + act1 * 0.55;
      for (let i = 0; i < RIBBON_UNIFORM_SEGMENTS; i += 1) {
        const u = i / (RIBBON_UNIFORM_SEGMENTS - 1);
        // 成形期起伏很小，卷舞期全幅。
        const fold = ribbonFold(u, t) * act1;
        foldArray[i] = fold;
        lakeFold[i] = fold;
        // 互动① 局部亮度 = 起伏量 × 流光接近度。
        gainArray[i] = ribbonLocalGain(u, t, glowUs) * act1;
      }
      ribbon.material.uniformsNeedUpdate = true;
      lake.material.uniformsNeedUpdate = true;

      // ③ 星光背景：整幕在场，爆发时被压暗（曝光感）。
      stars.material.uniforms.uTime.value = seconds;
      stars.material.uniforms.uAlpha.value = 0.55 * (1 - burstLevel * 0.35);

      // ④ 雪山剪影：雪顶被极光照亮，亮度随带亮度走。
      mountain.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.8);
      mountain.material.uniforms.uGlow.value = (0.25 + burstLevel * 0.75) * fade;

      // ⑦ 倒影湖面：跟着带子翻卷（共享 uFold）。
      lake.material.uniforms.uTime.value = seconds;
      lake.material.uniforms.uAlpha.value = (0.3 + burstLevel * 0.6) * Math.min(1, act1 * 1.4) * fade;

      // ⑤ 边缘丝：挂在带上各自位置，跟着带面起伏上下。
      for (const fringe of fringes) {
        const p = ribbonPoint(fringe.u, t);
        // 挂在带下缘。
        fringe.mesh.position.set(p.x, p.y - ribbonHeight * 0.09, -5);
        const crest = Math.abs(ribbonFold(fringe.u, t));
        // 起伏峰处的丝更长更亮（等离子体沿磁力线下坠）。
        fringe.mesh.scale.y = 0.7 + crest * 0.8;
        fringe.mesh.material.opacity = act1 * (0.2 + crest * 0.4) * fade;
      }

      // ② 流动光（几何件）：沿带流动。
      for (let i = 0; i < flows.length; i += 1) {
        const flow = flows[i];
        const u = glowUs[i];
        const p = ribbonPoint(u, t);
        flow.mesh.position.set(p.x, p.y, -4);
        flow.mesh.material.opacity = act1 * (0.4 + burstLevel * 0.5) * fade;
        flow.mesh.scale.setScalar(0.8 + Math.abs(ribbonFold(u, t)) * 0.5);
      }

      // ⑧ 爆发点：带上固定位置突然增亮。
      const burstPoint = ribbonPoint(BURST_U, t);
      burst.position.set(burstPoint.x, burstPoint.y, -3);
      burst.material.opacity = burstLevel * 0.9;
      burst.scale.setScalar(0.6 + burstLevel * 1.4);

      // 粒子发射点跟着第一颗流光（成片流光沿带走）。
      const lead = ribbonPoint(glowUs[0], t);
      glowPos.set(lead.x, lead.y, -4);
      glowAnchor.position.copy(glowPos);
      if (glowSystem) {
        glowSystem.emitter.position.copy(glowPos);
        glowSystem.emissionOverTime = new ConstantValue(8 + act2 * 70 + burstLevel * 50);
      }

      // 屏宽兜底：带与星空都已按倍数建。
      void width;
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
    packId: 'aurora',
    title: '极光绸带',
    elements: [
      '极光带', '流动光', '星光背景', '雪山剪影',
      '极光边缘丝', '光影翻卷', '倒影湖面', '爆发点',
    ],
    signature: '唯一"时空绸带"；与 dragon（实体蜿蜒生物）同为 wave 物理但完全不同的媒介',
    preset: 'wave',
  },
  createAuroraStage,
);

export { createAuroraStage };
