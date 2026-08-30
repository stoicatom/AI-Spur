/**
 * 场景 16 sun（glow · 日冕辉光，1200ms）。
 *
 * 三幕（规格 §4.2 场景 16）：
 * - 0–250ms    日珥喷发
 * - 250–900ms  日冕脉动
 * - 900–1200ms 渐缓辉光
 *
 * 互动：①日珥卷起推高日冕亮度——日冕的 uAlpha 由**当前日珥总卷曲量**
 * 驱动，日珥不动日冕就不亮；②脉冲环与日珥节奏同步——环的呼吸相位
 * 取自同一个卷曲量，两者是同源而非各跑一条正弦。
 *
 * 独立签名：**唯一「恒星」场景 + 日珥卷曲全库唯一**。与 moon 的
 * 「天体升沉」互为昼夜对照——moon 的主体在移动、表面静态；
 * sun 的主体原地不动、表面持续翻涌。
 *
 * 元素搭建在 ./sun-parts，本文件只做时间轴编排。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildSunParts } from './sun-parts';
import * as THREE from 'three';

/** 第一幕结束点（250/1200）。 */
export const SUN_ACT1_END = 250 / 1200;
/** 第二幕结束点（900/1200）。 */
export const SUN_ACT2_END = 900 / 1200;

/**
 * 单条日珥的卷曲进度（纯函数）。
 *
 * 日珥不是「亮起-熄灭」而是「伸出-卷回」：0→0.62 伸展，
 * 0.62→1 卷回并淡出。返回值 0–1 表示当前伸展量，
 * 因此可以直接作为几何缩放与亮度的共同来源。
 *
 * @param t 整幕归一化进度
 * @param at 该条日珥的起始时刻（整幕归一化）
 */
export function prominenceCurl(t: number, at: number): number {
  const local = (t - at) / 0.55;
  if (local <= 0 || local >= 1) return 0;
  // 伸出快、卷回慢：pow 让峰值偏前，符合喷发的爆发感。
  return Math.pow(Math.sin(local * Math.PI), 0.72);
}

/**
 * 全部日珥的卷曲总量（归一化 0–1）。
 *
 * 这是本场景两条互动的**共同驱动量**：日冕亮度与脉冲环呼吸都取自
 * 它，因此「日珥卷起推高日冕」和「脉冲环与日珥同步」是同一个量
 * 的两个出口，而不是各自写一条曲线再声称同步。
 *
 * @param t 整幕归一化进度
 * @param ats 各条日珥的起始时刻
 */
export function curlEnergy(t: number, ats: readonly number[]): number {
  if (ats.length === 0) return 0;
  let sum = 0;
  for (const at of ats) sum += prominenceCurl(t, at);
  return Math.min(1, sum / Math.max(1, ats.length * 0.55));
}

function createSunStage(ctx: CgStageContext): CgStage {
  const parts = buildSunParts(ctx);
  const { res, core, coronas, proms, spots, haze, pulse, uv, coreRadius } = parts;
  const { height } = ctx;

  // 太空微尘（规格元素⑧）：几何贴片表达不了细微飘尘，交给 quarks。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 110,
    lifetime: [0.8, 1.6],
    speed: [height * 0.03, height * 0.11],
    size: [1, 2.6],
    color: new THREE.Color('#FFE7B8'),
    shape: 'sphere',
    spread: coreRadius * 3.2,
    looping: true,
    rate: 64,
  });

  const promAts = proms.map((p) => p.at);
  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, SUN_ACT1_END, SUN_ACT2_END);
      // 两条互动的共同驱动量。
      const curl = curlEnergy(t, promAts);
      const fade = 1 - act3 * 0.55;

      // ① 日核：整幕常在，翻涌剧烈度跟着日珥走。
      core.material.uniforms.uTime.value = seconds;
      core.material.uniforms.uChurn.value = curl;
      core.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.2) * fade;

      // ② 日珥：各自伸出-卷回，缩放与亮度同源于 curl 进度。
      for (const prom of proms) {
        const c = prominenceCurl(t, prom.at);
        prom.mesh.material.opacity = c * 0.92 * fade;
        // 伸展量直接改缩放：日珥是「长出来」的，不是原地淡入。
        prom.mesh.scale.set(0.35 + c * 0.85, 0.35 + c * 0.85, 1);
        // 卷回阶段整条略微转动，像被磁场拖走。
        prom.mesh.rotation.z = prom.angle + c * 0.22 * prom.curl;
      }

      // 互动① ③ 日冕：亮度由日珥卷曲总量推高，日珥不动日冕就不亮。
      for (let i = 0; i < coronas.length; i += 1) {
        const corona = coronas[i];
        corona.material.uniforms.uTime.value = seconds;
        // 基底只给很小一层，主要亮度来自 curl——这样「推高」是可测的。
        const base = act1 * 0.08;
        corona.material.uniforms.uAlpha.value = (base + curl * (0.42 - i * 0.08)) * fade;
      }

      // 互动② ⑥ 脉冲环：呼吸相位取自同一个 curl，与日珥同源。
      pulse.material.opacity = (0.06 * act1 + curl * 0.34) * fade;
      pulse.scale.setScalar(0.88 + curl * 0.32);

      // ⑦ 紫外线光晕：冷色外圈，比日冕慢半拍（跟 act2 而非 curl）。
      uv.material.opacity = act1 * (0.07 + act2 * 0.17) * fade;
      uv.scale.setScalar(0.94 + act2 * 0.1);

      // ④ 光斑漂移：沿日面慢转，各自角速度不同。
      for (const spot of spots) {
        const angle = spot.angle0 + seconds * spot.omega;
        const r = coreRadius * spot.rr;
        spot.mesh.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 1);
        spot.mesh.material.opacity = act1 * (0.3 + curl * 0.4) * fade;
      }

      // ⑤ 热浪：整幕缓慢颤动，日珥旺时更强。
      haze.material.uniforms.uTime.value = seconds;
      haze.material.uniforms.uAlpha.value = act1 * (0.16 + curl * 0.24) * fade;
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
    packId: 'sun',
    title: '日冕辉光',
    elements: [
      '日核', '日珥', '日冕', '光斑漂移',
      '热浪', '日辉脉冲环', '紫外线光晕', '太空粒子',
    ],
    signature: '唯一"恒星"场景；日珥卷曲全库唯一',
    preset: 'glow',
  },
  createSunStage,
);

export { createSunStage };
