/**
 * 场景 17 meteor（comet · 陨火再入，1200ms）。
 *
 * 三幕（规格 §4.2 场景 17）：
 * - 0–250ms    再入加速
 * - 250–900ms  火鞘燃烧 + 碎片剥离
 * - 900–1200ms 坠地 + 尘环
 *
 * 互动：①剥落碎片进入尾迹被推远——碎片剥离时继承陨核速度并沿轨迹
 * 法向甩出，因此碎片在尾迹两侧排开而不是掉在原地；②坠地闪光贯穿
 * 音爆锥——闪光与锥面在同一帧达峰，且锥的马赫数在坠地瞬间跌落
 * （激波在撞击时溃散）。
 *
 * 独立签名：**唯一「大气再入」热力学叙事 + 音爆锥与屏幕微震荡全库唯一**。
 * 屏幕微震荡是整库唯一会位移**整个场景 group** 的机制——其它场景都只动
 * 自己的元素。与 comet 的「双向彗尾」同为天体，但 comet 在真空中没有
 * 激波、没有迎风面高温，机制完全不同。
 *
 * 元素搭建在 ./meteor-parts，碎片物理在 ./meteor-debris。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildMeteorParts } from './meteor-parts';
import { createDebrisField } from './meteor-debris';

/** 第一幕结束点（250/1200）。 */
export const METEOR_ACT1_END = 250 / 1200;
/** 第二幕结束点（900/1200）。 */
export const METEOR_ACT2_END = 900 / 1200;
/** 整幕时长（秒），物理与震荡都以它换算。 */
const DURATION_S = 1.2;

/** 第一片与最后一片碎片的剥离时刻（整幕归一化）。 */
const DEBRIS_FIRST_AT = 0.28;
const DEBRIS_LAST_AT = 0.74;

/**
 * 轨迹进度（纯函数）：再入是**加速**过程，不是匀速。
 *
 * 第一幕重力加速（二次），第二幕维持高速（近线性），
 * 第三幕已坠地（钳到 1）。返回 0–1 表示沿轨迹的位置比例。
 *
 * @param t 整幕归一化进度
 */
export function reentryProgress(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k >= METEOR_ACT2_END) return 1;
  // 归一化到 [0, act2End] 区间，用 pow>1 让末段更快（加速）。
  const u = k / METEOR_ACT2_END;
  return Math.pow(u, 1.55);
}

/**
 * 轨迹进度对**时间**的解析导数（单位：进度/秒）。
 *
 * 速度必须解析求导，不能用相邻两次 update 的进度差分：验收会在稀疏 t
 * 上调用，差分除以固定 1/60 会把速度高估几十倍，剥离出去的碎片直接
 * 飞出画面（实测 x 冲到 5725px）。解析导数与调用频率无关。
 *
 * @param t 整幕归一化进度
 */
export function reentryRate(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  if (k >= METEOR_ACT2_END) return 0;
  const u = k / METEOR_ACT2_END;
  // d/dt pow(t/T, 1.55) = 1.55/T * pow(u, 0.55)，再把 t 从归一化换到秒。
  return (1.55 / METEOR_ACT2_END) * Math.pow(u, 0.55) / DURATION_S;
}

/**
 * 屏幕微震荡幅度（纯函数，签名的一半）。
 *
 * 只在坠地瞬间前后存在，且**衰减**——持续等幅抖动看着像 bug 不像冲击。
 * 用衰减正弦：包络 exp 衰减，载波高频。
 *
 * @param t 整幕归一化进度
 */
export function screenShakeAmount(t: number): number {
  // 坠地在第二幕末（act2End），震荡从那一刻起衰减。
  const since = t - METEOR_ACT2_END;
  if (since < 0) return 0;
  const envelope = Math.exp(-since * 14);
  return Math.abs(Math.sin(since * 118)) * envelope;
}

function createMeteorStage(ctx: CgStageContext): CgStage {
  const parts = buildMeteorParts(ctx);
  const { res, core, shell, trail, mach, flash, dustRings, from, to, scale, trailLength } = parts;
  const { width, height } = ctx;

  // 轨迹方向与长度：火鞘与尾迹都按它定向。
  const path = to.clone().sub(from);
  const pathAngle = Math.atan2(path.y, path.x);
  const pathLength = path.length();

  // ③ 剥落碎片：地面取落点高度，碎片在此反弹。
  const debris = createDebrisField(res, ctx, scale, to.y, DEBRIS_FIRST_AT, DEBRIS_LAST_AT);

  // ② 火屑（规格元素②的粒子部分）：几何贴片表达不了飞散火星。
  const hub = createParticleHub(res.group, ctx.quality);
  const emberPosition = new THREE.Vector3(from.x, from.y, 0);
  const embers = hub.emit({
    count: 128,
    lifetime: [0.25, 0.7],
    speed: [scale * 1.2, scale * 4.5],
    size: [1.4, 4.2],
    color: new THREE.Color('#FFC66B'),
    shape: 'cone',
    spread: 0.55,
    position: emberPosition,
    looping: true,
    rate: 96,
  });

  // 火屑锚点：quarks 会把 emitter 从场景树摘走，锚点让发射点可定位。
  const emberAnchor = new THREE.Object3D();
  emberAnchor.name = 'ember-anchor';
  res.group.add(emberAnchor);

  let lastNow = ctx.now;
  const corePos = new THREE.Vector3();
  const coreVel = new THREE.Vector3();

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, METEOR_ACT1_END, METEOR_ACT2_END);

      // 轨迹位置与速度：速度取解析导数，与 update 调用频率无关。
      const progress = reentryProgress(t);
      corePos.set(from.x + path.x * progress, from.y + path.y * progress, 0);
      // 像素/秒 = (进度/秒) × 轨迹全长。
      const speedScalar = reentryRate(t) * pathLength;
      coreVel.set(
        (path.x / pathLength) * speedScalar,
        (path.y / pathLength) * speedScalar,
        0,
      );

      // 签名·屏幕微震荡：位移整个场景 group（全库唯一）。
      const shake = screenShakeAmount(t);
      res.group.position.set(
        ctx.origin.x + Math.sin(seconds * 97) * shake * scale * 0.4,
        ctx.origin.y + Math.cos(seconds * 113) * shake * scale * 0.4,
        ctx.origin.z,
      );

      // ① 陨核：沿轨迹飞行 + 持续翻滚，坠地后隐没在闪光里。
      core.position.copy(corePos);
      core.rotation.set(seconds * 5.2, seconds * 3.7, seconds * 4.4);
      core.material.opacity = Math.min(1, act1 * 1.4) * (1 - act3);

      // ② 火鞘：跟着核走，迎风轴对准飞行方向；热度随速度涨。
      shell.position.copy(corePos);
      shell.rotation.z = pathAngle;
      shell.material.uniforms.uTime.value = seconds;
      // 热度跟着轨迹进度涨——再入越深大气越稠，加热越剧烈。
      shell.material.uniforms.uHeat.value = Math.min(1, progress * 1.3);
      shell.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.5) * (1 - act3 * 0.85);

      // ④ 电离尾迹：从入射点铺到当前核位，按进度拉伸。
      // 贴片以中点为原点，所以要放在「入射点与核位的中点」。
      const trailSpan = Math.max(0.001, pathLength * progress);
      trail.position.set(
        (from.x + corePos.x) / 2,
        (from.y + corePos.y) / 2,
        -1,
      );
      trail.rotation.z = pathAngle;
      trail.scale.x = trailSpan / trailLength;
      trail.material.uniforms.uTime.value = seconds;
      trail.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.2) * (1 - act3 * 0.7);
      // 分段深度在第二幕最强：等离子体团断续复合。
      trail.material.uniforms.uBreak.value = act2 * 0.85;

      // ⑤ 音爆锥：锥顶跟着核，马赫数随速度涨；坠地瞬间激波溃散。
      mach.position.copy(corePos);
      mach.rotation.z = pathAngle;
      const machNumber = 1.15 + progress * 2.6;
      mach.material.uniforms.uMach.value = act3 > 0 ? 1.05 : machNumber;
      mach.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.3) * (1 - act3);

      // ⑥ 坠地闪光：第三幕起爆一次白闪。
      const flashPeak = act3 > 0 ? Math.exp(-act3 * 7) : 0;
      flash.material.uniforms.uAlpha.value = flashPeak * 0.9;

      // ⑦ 尘环：坠地后三圈外扬，各自速度不同。
      for (let i = 0; i < dustRings.length; i += 1) {
        const ring = dustRings[i];
        const delay = i * 0.08;
        const local = Math.max(0, act3 - delay) / Math.max(0.001, 1 - delay);
        ring.material.opacity = local > 0 ? Math.sin(local * Math.PI) * 0.55 : 0;
        ring.scale.set(1 + local * (2.4 + i * 0.9), 0.34 * (1 + local * (2.4 + i * 0.9)), 1);
      }

      // ③ 互动① 碎片剥离并被尾迹推远。
      // 物理时间从碎片首次剥离时刻起算，与场景时间轴对齐。
      const debrisElapsed = Math.max(0, t - DEBRIS_FIRST_AT) * DURATION_S;
      debris.advance(t, debrisElapsed, corePos, coreVel);
      debris.setOpacity(Math.min(1, act2 * 2) * (1 - act3 * 0.4));

      // 火屑发射点跟着陨核（火鞘在剥落火星）。
      emberPosition.copy(corePos);
      emberAnchor.position.copy(corePos);
      if (embers) embers.emitter.position.copy(corePos);

      // 屏宽兜底：闪光贴片已按 1.6 倍屏幕建，无需再缩放。
      void width;
      void height;
    },

    dispose(): void {
      if (res.disposed) return;
      debris.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'meteor',
    title: '陨火再入',
    elements: [
      '陨核', '火鞘', '剥落碎片', '电离尾迹',
      '音爆锥', '坠地闪光', '尘环', '大气扰动',
    ],
    signature: '唯一"大气再入"热力学叙事；音爆锥+屏幕微震荡全库唯一',
    preset: 'comet',
  },
  createMeteorStage,
);

export { createMeteorStage };
