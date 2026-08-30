/**
 * 场景 15 moon（arc · 月晕弧光，1200ms）。
 *
 * 三幕（规格 §4.2 场景 15）：
 * - 0–300ms    月升（月轮自地平线下抬升到位）
 * - 300–900ms  弧光扫掠 + 月晕脉动
 * - 900–1200ms 夜云上移掩月 + 月尘飘落
 *
 * 互动：①月晕弧光扫过时云层变亮——云的 uFlash 由弧带与云层的
 * **角度接近度**驱动，弧带扫到哪层云那层才亮，不是整幕齐亮；
 * ②月尘沿弧线坠落——尘粒发射点跟着弧带头部走。
 *
 * 独立签名：**唯一「天体升沉」场景**。全库其它场景的主体都在原地
 * 爆发/旋转，只有这里主体本身有一条完整的升起-驻留-被掩的位移轨迹，
 * 与 sun 的「日冕辉光」（恒星原地翻涌）互为昼夜对照。
 *
 * 元素搭建在 ./moon-parts，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildMoonParts } from './moon-parts';

/** 第一幕结束点（300/1200）。 */
export const MOON_ACT1_END = 300 / 1200;
/** 第二幕结束点（900/1200）。 */
export const MOON_ACT2_END = 900 / 1200;

/** 弧带扫掠范围：从右下起，逆时针扫过月轮上方到左下。 */
const SWEEP_FROM = -Math.PI * 0.35;
const SWEEP_TO = Math.PI * 1.35;

/**
 * 弧带当前中心角（纯函数，便于直接验收「扫过」而非「常亮」）。
 *
 * @param act2 第二幕归一化进度
 */
export function arcSweepAngle(act2: number): number {
  const k = Math.min(1, Math.max(0, act2));
  // 缓入缓出：弧带起步慢、中段快，收尾再慢，像光带被拖过去。
  const eased = k * k * (3 - 2 * k);
  return SWEEP_FROM + (SWEEP_TO - SWEEP_FROM) * eased;
}

/**
 * 月轮中心高度（纯函数，签名「天体升沉」的可验收核心）。
 *
 * 分三段：升起（act1，从地平线下抬到位）、驻留（act2，微幅浮动）、
 * 被云掩（act3，略微回落，配合云层上移）。
 *
 * @param t 整幕归一化进度
 * @param topY 升满后的中心高度
 * @param height 画面高度
 */
export function moonCenterY(t: number, topY: number, height: number): number {
  const [act1, , act3] = acts(t, MOON_ACT1_END, MOON_ACT2_END);
  const bottom = -height * 0.52;
  // 升起用 sin 缓出：出地平线时快，接近位时慢下来。
  const rise = Math.sin(Math.min(1, act1) * Math.PI * 0.5);
  const risen = bottom + (topY - bottom) * rise;
  return risen - act3 * height * 0.035;
}

/** 云层与弧带的角度接近度：弧带扫到这层云所在方位时最大。 */
function cloudLit(sweep: number, cloudAngle: number): number {
  const diff = Math.abs(((sweep - cloudAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
  return Math.max(0, 1 - diff / 0.9);
}

function createMoonStage(ctx: CgStageContext): CgStage {
  const parts = buildMoonParts(ctx);
  const { res, moon, arc, halos, pulse, meteors, clouds, pool, moonRadius, moonTopY } = parts;
  const { width, height } = ctx;

  // 月尘（规格元素⑥）：几何贴片表达不了细尘飘落，交给 quarks。
  // 发射点每帧跟着弧带头部走，实现「沿弧线坠落」。
  const hub = createParticleHub(res.group, ctx.quality);
  const dustPosition = new THREE.Vector3(0, moonTopY, 0);
  const dust = hub.emit({
    count: 96,
    lifetime: [0.5, 1.1],
    speed: [height * 0.05, height * 0.16],
    size: [1.2, 3.2],
    color: new THREE.Color('#E8F0FF'),
    shape: 'cone',
    spread: 0.5,
    position: dustPosition,
    looping: true,
    rate: 70,
  });

  // 月尘锚点：quarks 的 BatchedRenderer 接管系统后会把 emitter 从
  // 场景树摘走，所以发射点无法在树里定位。用一个自持锚点同步它的
  // 位置，既让场景树自描述（规格元素⑥可见），也让「沿弧线坠落」可验收。
  const dustAnchor = new THREE.Object3D();
  dustAnchor.name = 'moondust-anchor';
  res.group.add(dustAnchor);

  let lastNow = ctx.now;

  // 云层方位角：两层云分居月轮左右下方，弧带扫过各自方位时才亮。
  const cloudAngles = clouds.map((_, i) => Math.PI * (0.82 + i * 0.36));

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, MOON_ACT1_END, MOON_ACT2_END);
      const sweep = arcSweepAngle(act2);
      // 弧光只在第二幕存在：进出各留一段淡入淡出。
      const arcAlpha = act2 > 0 && act2 < 1 ? Math.sin(act2 * Math.PI) * 0.95 : 0;

      // ① 月面：升起-驻留-回落，signature 的位移轨迹在此。
      const centerY = moonCenterY(t, moonTopY, height);
      moon.position.y = centerY;
      moon.material.uniforms.uTime.value = seconds;
      moon.material.uniforms.uPhase.value = act1;
      // 弧光扫掠时月缘辉光跟着涨，月轮与弧光是一体的。
      moon.material.uniforms.uGlow.value = act1 * (0.35 + arcAlpha * 0.65) * (1 - act3 * 0.5);

      // ③ 月出弧光：中心角随第二幕扫过，跟着月轮走高。
      arc.position.y = centerY;
      arc.material.uniforms.uSweep.value = sweep;
      arc.material.uniforms.uAlpha.value = arcAlpha;
      // 扫得快的时候带子拉长，像高速掠过的余晖。
      arc.material.uniforms.uWidth.value = 0.34 + arcAlpha * 0.42;

      // ② 月晕：三圈错相呼吸，第二幕最盛。
      for (const halo of halos) {
        const breath = 0.5 + 0.5 * Math.sin(seconds * 3.1 + halo.phase);
        halo.mesh.position.y = centerY;
        halo.mesh.material.opacity = act1 * (0.14 + arcAlpha * 0.34) * (0.55 + breath * 0.45) * (1 - act3 * 0.7);
        const swell = 1 + breath * 0.06 + arcAlpha * 0.05;
        halo.mesh.scale.setScalar(swell);
      }

      // ⑦ 脉动环：单圈呼吸，向外扩张后回缩。
      const pulseBreath = 0.5 + 0.5 * Math.sin(seconds * 2.2);
      pulse.position.y = centerY;
      pulse.material.opacity = act1 * (0.1 + arcAlpha * 0.2) * (1 - act3 * 0.8);
      pulse.scale.setScalar(0.92 + pulseBreath * 0.16 + act2 * 0.1);

      // ④ 碎星陨：各自在 at 时刻附近划过一段。
      for (const meteor of meteors) {
        const local = (t - meteor.at) / 0.16;
        const alive = local > 0 && local < 1;
        meteor.mesh.material.opacity = alive ? Math.sin(local * Math.PI) * 0.7 : 0;
        if (alive) {
          const travel = meteor.span * 3.2 * local;
          meteor.mesh.position.set(
            meteor.from.x + meteor.dir.x * travel,
            meteor.from.y + meteor.dir.y * travel,
            0,
          );
        }
      }

      // ⑤ 夜云 + 互动① 弧光扫过处云层变亮。
      for (let i = 0; i < clouds.length; i += 1) {
        const cloud = clouds[i];
        cloud.material.uniforms.uTime.value = seconds;
        // 整幕都有云，末幕加厚以「掩月」。
        cloud.material.uniforms.uDensity.value = 0.3 * act1 + act3 * 0.62;
        cloud.material.uniforms.uFlash.value = cloudLit(sweep, cloudAngles[i]) * arcAlpha * 0.85;
        // 末幕上移遮住月轮下缘。
        cloud.position.y = -height * (0.1 + i * 0.16) + act3 * height * 0.34;
      }

      // ⑧ 地面月光池：随月轮升起亮起，呼吸与脉动环同源。
      pool.material.uniforms.uAlpha.value = act1 * 0.42 * (1 - act3 * 0.45);
      pool.material.uniforms.uBreath.value = pulseBreath;

      // 互动② 月尘沿弧线坠落：发射点锁在弧带头部（弧半径 0.42×贴片尺寸）。
      const arcRadius = moonRadius * 5.2 * 0.42;
      dustPosition.set(
        Math.cos(sweep) * arcRadius,
        centerY + Math.sin(sweep) * arcRadius,
        0,
      );
      dustAnchor.position.copy(dustPosition);
      if (dust) {
        dust.emitter.position.copy(dustPosition);
        // 末幕尘落最盛：云掩月之后剩下的就是尘。
        // emissionOverTime 是生成器而非裸数值，必须整体替换而非改字段。
        dust.emissionOverTime = new ConstantValue(70 * (0.3 + arcAlpha * 0.5 + act3 * 0.9));
      }

      // 屏宽兜底：月光池宽度跟着画面，避免窄屏露出池缘。
      pool.scale.x = Math.max(1, width / (width * 0.9));
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
    packId: 'moon',
    title: '月晕弧光',
    elements: [
      '月面', '月晕弧', '月出弧光', '碎星陨',
      '夜云半掩', '月尘', '光晕脉动环', '地面月光池',
    ],
    signature: '唯一"天体升沉"场景；与 sun 的"日冕辉光"互为昼夜对照',
    preset: 'arc',
  },
  createMoonStage,
);

export { createMoonStage };
