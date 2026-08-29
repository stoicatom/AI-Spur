/**
 * 场景 06 katana（dash · 居合斩，1200ms）。
 *
 * 三幕（规格 §4.2 场景 06）：
 * - 0–200ms    静场蓄势（万籁俱寂，只有月光在场）
 * - 200–700ms  一斩：线 + 弧 + 火花同帧爆发
 * - 700–1200ms 刀身入鞘暗光 + 残影散
 *
 * 互动：①刀气弧扫过绸布将其截断（弧位置 arcSweep 既摆弧、又决定拆哪排
 * 布约束，两端同一个量）；②火花沿斩击线飞溅（火花坐标由 seat 沿斩击轴
 * 生成，垂距恒为 0 量级）；③屏裂闪光在斩击瞬间全屏闪白（uFlash 由
 * iaiEnergy 派生，与刀光同源，不是另一条曲线）。
 *
 * 独立签名：**静场→爆发对比全库最强烈**——iaiEnergy 是纯函数，
 * 第一幕全程压在 KATANA_STILL_FLOOR 以下，第二幕峰值破 0.9，
 * 比值 20 倍以上，且整场只有一次上冲一次回落（单峰突起）。
 *
 * 元素搭建在 ./katana-parts 与 ./katana-silk，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildKatanaParts } from './katana-parts';
import { materialIdentityFor } from '../material-identity';

const TOTAL_MS = 1200;
/** 三幕边界（归一化，对应 1200ms）。 */
export const KATANA_ACT1_END = 200 / TOTAL_MS;
export const KATANA_ACT2_END = 700 / TOTAL_MS;

/**
 * 静场亮度地板：第一幕的能量上限。
 *
 * 不取 0 而留一条极窄的地板，是因为「万籁俱寂」也要有一丝月色底光，
 * 全黑会让第一幕看着像还没加载。数值同时是签名对比的分母。
 */
export const KATANA_STILL_FLOOR = 0.04;

/** 爆发峰值出现在第二幕的哪个位置（幕内归一化）——靠前才叫「一击」。 */
const BURST_PEAK = 0.14;

/**
 * 居合能量曲线（纯函数，签名「静场→爆发对比」的唯一来源）。
 *
 * 三段闭式而非逐帧累加：同一 t 永远得到同一值，测试可以直接对曲线性质
 * （地板、峰值、单峰）断言，不受采样步长影响。
 *
 * - 第一幕：线性爬到地板值，全程 ≤ KATANA_STILL_FLOOR。
 * - 第二幕：BURST_PEAK 前急冲到 1，之后长衰减——快起慢落是刀光的形状。
 * - 第三幕：延续衰减，收在地板附近（入鞘暗光）。
 *
 * 「一次上冲一次回落」是构造出来的：三段里只有第二幕前段是升的，
 * 其余全段单调降，所以导数符号恰好翻转一次。
 *
 * @param t 归一化总进度
 */
export function iaiEnergy(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k < KATANA_ACT1_END) {
    // 静场：贴地板缓爬，末端刚好触到地板值（蓄势的那一丝紧绷）。
    return KATANA_STILL_FLOOR * (k / KATANA_ACT1_END);
  }
  const act2 = (Math.min(k, KATANA_ACT2_END) - KATANA_ACT1_END) / (KATANA_ACT2_END - KATANA_ACT1_END);
  if (act2 <= BURST_PEAK) {
    // 上冲：从地板值直冲 1，用 sqrt 让起手就已经很亮（居合是瞬发）。
    const rise = Math.sqrt(act2 / BURST_PEAK);
    return KATANA_STILL_FLOOR + (1 - KATANA_STILL_FLOOR) * rise;
  }
  // 回落：峰后指数衰减，跨第二三幕连续（k 超过 ACT2_END 时继续用总进度算）。
  const decay = (Math.max(k, KATANA_ACT2_END) === k ? (k - KATANA_ACT1_END) : (k - KATANA_ACT1_END))
    / (KATANA_ACT2_END - KATANA_ACT1_END);
  return Math.exp(-(decay - BURST_PEAK) * 2.6);
}

/**
 * 刀气弧沿斩击轴的推进量（纯函数，互动① 的唯一驱动量）。
 *
 * 返回 -1（线首）→ 1（线尾）的归一化站位。单调不回摆：回摆会让绸布
 * 「断了又接上」，而截断在物理上是不可逆的。
 *
 * @param t 归一化总进度
 */
export function arcSweep(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  // 静场期弧尚未出发，停在线首外侧。
  if (k <= KATANA_ACT1_END) return -1;
  const act2 = Math.min(1, (k - KATANA_ACT1_END) / (KATANA_ACT2_END - KATANA_ACT1_END));
  // 前段极快、末段收尾：居合是一闪而过，不是匀速划线。
  return -1 + 2 * Math.pow(act2, 0.55);
}

function createKatanaStage(ctx: CgStageContext): CgStage {
  const parts = buildKatanaParts(ctx);
  const { res, axis, reach, silk } = parts;
  const { height } = ctx;
  // 物理档案取 katana 行的数值项：刀的回弹与共鸣决定残影拖曳与火花溅射，
  // 避免这里再拍一组魔法数。force 是类型枚举（'recoil'），不能当乘数。
  const { resonance, restitution } = materialIdentityFor('katana', 'dash', ctx.params).physical;

  // 粒子层：斩击溅出的金属屑，沿斩击轴定向喷射（规格④「quarks 定向喷射」）。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 58,
    lifetime: [0.2, 0.6],
    speed: [reach * 0.3, reach * 0.95],
    size: [1.4, 3.8],
    color: new THREE.Color('#FFE3B0'),
    shape: 'cone',
    spread: 0.3,
    position: new THREE.Vector3(0, 0, 18),
  });

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, KATANA_ACT1_END, KATANA_ACT2_END);
      const slashing = t >= KATANA_ACT1_END;
      // 签名量：整场所有「亮」都由它派生，静场与爆发的对比因此是同一条曲线的两端。
      const energy = iaiEnergy(t);
      // 弧位置：互动① 的驱动量，同时摆弧与决定拆哪排布约束。
      const sweep = arcSweep(t);

      // ⑧ 月光静场：第一幕唯一在场；爆发时背景压更黑以拉高对比。
      const moon = parts.moonlight.material.uniforms;
      moon.uGlow.value = 0.35 + act1 * 0.5 - act3 * 0.25;
      moon.uDark.value = 0.55 + (slashing ? energy * 0.3 : 0) + act3 * 0.1;

      // ① 刀身：静场期握刀待发（暗），第二幕沿轴掠过，第三幕入鞘暗光。
      const bladeRun = slashing ? sweep : -1;
      parts.blade.position.set(axis.x * bladeRun * reach * 0.62, axis.y * bladeRun * reach * 0.62, 20);
      // 刃高光随能量走：入鞘后只余一线暗光（规格三幕「刀身入鞘暗光」）。
      parts.bladeEdge.material.opacity = Math.min(1, energy * 1.1) * (1 - act3 * 0.82);
      parts.bladeFace.material.opacity = (0.25 + act1 * 0.35) * (1 - act3 * 0.7);

      // ② 斩击线：越界即在场，横贯全屏；辉光比细线衰得快。
      parts.slashLine.material.opacity = slashing ? Math.min(1, energy * 1.3) : 0;
      parts.slashGlow.material.opacity = slashing ? Math.min(0.7, energy * energy * 0.8) : 0;

      // ③ 刀气弧：uSweep 用能量，位置用 sweep，两者都在越界那一帧起来。
      const arc = parts.auraArc.material.uniforms;
      arc.uSweep.value = slashing ? Math.min(1, energy * 1.15) : 0;
      arc.uThickness.value = 0.05 + energy * 0.07;
      parts.auraArc.position.set(axis.x * sweep * reach * 0.5, axis.y * sweep * reach * 0.5, 10);

      // ④ 斩击火花：坐标由 seat 沿斩击轴生成，垂距只有一点点溅开量——
      // 互动② 的「沿线」是坐标构造出来的，不是靠参数凑近。
      for (const spark of parts.sparks) {
        const mesh = spark.mesh;
        if (!slashing) { mesh.material.opacity = 0; continue; }
        // 只有弧已扫过的站位才溅火花：火花跟着斩击走，不是全线一起亮。
        const lit = sweep - spark.seat;
        if (lit < 0) { mesh.material.opacity = 0; continue; }
        const life = Math.min(1, lit * 2.2);
        const along = spark.seat * reach * 0.94;
        // 垂向溅开：以刀线为轴向两侧弹开，幅度由 restitution（回弹）定。
        const off = (spark.phase - 0.5) * height * 0.13 * life * (0.4 + restitution);
        mesh.position.set(
          axis.x * along - axis.y * off,
          axis.y * along + axis.x * off,
          18,
        );
        mesh.material.opacity = Math.sin(Math.min(1, life) * Math.PI) * (1 - act3 * 0.9);
      }

      // ⑤ 残影定格：第二幕定住，第三幕散（规格「残影散」）。
      for (let i = 0; i < parts.ghosts.length; i += 1) {
        const ghost = parts.ghosts[i];
        // 逐层延迟出现：三层是「同一动作的三个瞬间」，不该同时到位。
        const born = Math.max(0, act2 * 1.4 - i * 0.22);
        ghost.material.uniforms.uFade.value = Math.min(1, born) * Math.pow(1 - act3, 1.6 + i * 0.4);
      }

      // ⑥ 屏裂闪光：uFlash 由 energy 派生（互动③ 与刀光同源），
      // 平方让它比刀光更短促——闪白是一瞬，不是一幕。
      parts.crackFlash.material.uniforms.uFlash.value = slashing
        ? Math.min(1, energy * energy * 1.25) * (1 - act3 * 0.95)
        : 0;

      // ⑦ 绸布：刀风沿斩击轴撩起（规格「被刀风撩起」），
      // 撩起强度同样取 energy，所以布动与刀光是同一次爆发。
      const wind = slashing
        ? new THREE.Vector2(axis.x, axis.y).multiplyScalar(reach * energy * 5.5 * resonance)
        : new THREE.Vector2(Math.sin(seconds * 1.3) * reach * 0.05, 0);
      silk.update(delta, wind);
      // 互动①：弧扫到哪，布就断到哪——同一个 sweep 驱动两端。
      if (slashing) silk.severAcross(sweep * reach);
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      // 布的刚体与约束先摘干净：World 无 dispose，留着会让 solver 持有引用。
      silk.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'katana',
    title: '居合斩',
    elements: ['刀身', '斩击线', '刀气弧', '斩击火花', '残影人间', '屏裂闪光', '绸布飘落', '月光静场'],
    signature: '唯一"居合一击"叙事；静场→爆发对比全库最强烈',
    preset: 'dash',
  },
  createKatanaStage,
);

export { createKatanaStage };
