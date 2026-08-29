/**
 * 场景 03 lightning（bolt · 雷暴云幕，1200ms）。
 *
 * 三幕（规格 §4.2 场景 03）：
 * - 0–240ms   云压顶、云内暗闪蓄能
 * - 240–780ms 三相先导依次劈落、落雷点光池扩散
 * - 780–1200ms 余电游走、云层散场
 *
 * 互动：①雨幕在电弧经过处瞬间增亮；②云内暗闪节奏与主弧劈落耦合
 * （先闪一次天、再劈一道）；③落雷点亮斑启动光池涟漪。
 * 三者共用 phaseCoupling 的同一个相内进度，因此耦合是真的而非各演各的。
 *
 * 独立签名：**先导-暗闪-落雷三相耦合**——全库只有这个场景把一次放电
 * 拆成三个严格先后的阶段，并把它重复三相。
 *
 * 元素搭建在 ./lightning-parts，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildLightningParts } from './lightning-parts';

/** 第一幕结束点（240/1200）。 */
export const LIGHTNING_ACT1_END = 240 / 1200;
/** 第二幕结束点（780/1200）。 */
export const LIGHTNING_ACT2_END = 780 / 1200;

/** 三相等分第二幕。 */
const PHASE_COUNT = 3;

export type PhaseCoupling = {
  /** 先导强度：相内最先起势。 */
  lead: number;
  /** 云内暗闪：居中，先导之后、主弧之前。 */
  darkFlash: number;
  /** 主弧劈落：相内最后。 */
  strike: number;
};

/**
 * 一相内的三阶段耦合曲线（纯函数，便于直接验收签名）。
 *
 * 三段共用同一个相内进度 p，用错开的窗口切出严格先后：
 * 先导 0→0.45 起落、暗闪 0.28→0.52 起落、主弧 0.52→1 起落。
 * 主弧窗口起点与暗闪窗口终点对齐，所以「暗闪峰值时主弧尚未落」
 * 是曲线本身的性质，不靠调用方按顺序调用来保证。
 *
 * @param p 相内归一化进度
 */
export function phaseCoupling(p: number): PhaseCoupling {
  const k = Math.min(1, Math.max(0, p));

  // 先导：早起早落，0.45 后完全让位。
  const lead = k < 0.45 ? Math.sin((k / 0.45) * Math.PI) : 0;

  // 暗闪：0.28–0.52 的窄窗，峰值 0.40。
  const flashSpan = 0.52 - 0.28;
  const darkFlash = k > 0.28 && k < 0.52 ? Math.sin(((k - 0.28) / flashSpan) * Math.PI) : 0;

  // 主弧：0.52 起劈，尾端归零（t=1 时 close to 0）。
  const strike = k <= 0.52 ? 0 : Math.pow(Math.sin(((k - 0.52) / 0.48) * Math.PI), 0.7);

  return { lead, darkFlash, strike };
}

/** 当前处在第几相、相内进度多少。 */
function phaseAt(act2: number): { index: number; p: number } {
  const scaled = Math.min(0.999999, Math.max(0, act2)) * PHASE_COUNT;
  return { index: Math.floor(scaled), p: scaled % 1 };
}

function createLightningStage(ctx: CgStageContext): CgStage {
  const parts = buildLightningParts(ctx);
  const { res, cloud, darkFlash, bolts, rain, serpents, blast, lamps } = parts;
  const { width, height } = ctx;

  // 粒子层（规格元素②火花节点 + ⑤斜雨）：几何条带只能表达「一片雨」，
  // 飞散的颗粒必须交给 quarks，档位与释放由工具层统一管。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 64,
    lifetime: [0.25, 0.7],
    speed: [height * 0.25, height * 0.75],
    size: [2, 5.5],
    color: new THREE.Color('#EAF0FF'),
    shape: 'cone',
    spread: 0.42,
    position: new THREE.Vector3(bolts[0].strikeX, -height * 0.42, 0),
  });
  hub.emit({
    count: 80,
    lifetime: [0.6, 1.2],
    speed: [height * 0.5, height * 0.9],
    size: [1.5, 3],
    color: new THREE.Color('#8FA8D8'),
    shape: 'sphere',
    spread: width * 0.5,
    looping: true,
    rate: 60,
  });

  let lastNow = ctx.now;

  // 电荷游灯的静态排布：沿云底一线，运行期只改亮度与轻微浮动。
  const lampMatrix = new THREE.Matrix4();
  const lampBase: { x: number; y: number; phase: number }[] = [];
  for (let i = 0; i < lamps.count; i += 1) {
    lampBase.push({
      x: (i / Math.max(1, lamps.count - 1) - 0.5) * width * 1.12,
      y: cloud.position.y - height * 0.28 + Math.sin(i * 2.1) * height * 0.03,
      phase: i * 1.7,
    });
  }

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, LIGHTNING_ACT1_END, LIGHTNING_ACT2_END);
      const { index, p } = phaseAt(act2);
      const coupling = phaseCoupling(p);
      // 第二幕之外没有放电，三条曲线一并归零。
      const active = act2 > 0 && act3 < 1 ? 1 : 0;
      const lead = coupling.lead * active;
      const flash = coupling.darkFlash * active;
      const strike = coupling.strike * active;

      // ① 云幕：第一幕压顶成形，末幕散场。
      cloud.material.uniforms.uTime.value = seconds;
      cloud.material.uniforms.uDensity.value = act1 * (1 - act3 * 0.75);
      // 云内发光同时吃暗闪与主弧：一次放电从云里亮起再劈出去。
      cloud.material.uniforms.uFlash.value = Math.max(flash * 0.9, strike * 0.55) + act1 * 0.08;
      cloud.position.y = height * 0.5 - height * 0.72 * 0.42 + (1 - act1) * height * 0.06;

      // ③ 云内暗闪：蓄能幕有低频预闪，第二幕跟着 coupling 走。
      const prelude = act3 > 0 ? 0 : Math.max(0, Math.sin(t * Math.PI * 14)) * (1 - act1) * 0.22;
      darkFlash.material.opacity = Math.max(flash * 0.8, prelude);

      // ② + ④ 三相电弧：只有当前相在放电，已过的相熄灭。
      for (let i = 0; i < bolts.length; i += 1) {
        const bolt = bolts[i];
        const mine = i === index ? 1 : 0;
        const boltAlpha = strike * mine;
        bolt.main.material.opacity = boltAlpha;
        // 主弧越亮越粗，视觉上像电流峰值。
        bolt.main.scale.set(0.8 + boltAlpha * 0.5, 1, 1);
        for (const fork of bolt.forks) {
          // 分叉比主弧晚一点点起、暗一截，先导期给一点微光预兆。
          fork.material.opacity = Math.max(0, boltAlpha - 0.18) * 0.72 + lead * mine * 0.12;
        }
        // 落雷光池：主弧落地后亮起并向外推涟漪。
        const poolAlpha = Math.pow(boltAlpha, 1.3) * 0.95;
        bolt.pool.material.uniforms.uAlpha.value = poolAlpha;
        bolt.pool.material.uniforms.uRipple.value = mine ? Math.min(1, p * 1.6) : 0;

        // 互动③ 落点溅雨：跟着光池一起起，但外推得更快、收得更早，
        // 看上去才像被砸起的水花而不是第二层光圈。
        bolt.splash.material.opacity = Math.pow(boltAlpha, 1.6) * 0.8;
        bolt.splash.scale.setScalar(0.4 + boltAlpha * 1.5);
      }

      // 互动① 雨幕：整幕有雨，正对当前落点的条带被照白。
      const strikeX = bolts[Math.min(index, bolts.length - 1)].strikeX;
      const litRadius = width * 0.18;
      for (const band of rain) {
        band.mesh.material.uniforms.uAlpha.value = 0.55 * act1 * (1 - act3 * 0.6);
        const distance = Math.abs(band.x - strikeX);
        // 近落点全亮、远处衰减到 0：这就是「电弧经过处」。
        const proximity = Math.max(0, 1 - distance / litRadius);
        band.mesh.material.uniforms.uBright.value = strike * proximity;
        // 雨往下走，斜率固定，靠 UV 偏移不动几何。
        band.mesh.position.y = -((seconds * height * 0.9) % (height * 0.2));
      }

      // ⑥ 余电游蛇：第三幕专属，绕屏缘游走。
      for (let i = 0; i < serpents.length; i += 1) {
        const serpent = serpents[i];
        serpent.material.opacity = Math.sin(act3 * Math.PI) * 0.65;
        const angle = Math.PI * (0.5 + i * 0.11) + seconds * (0.6 + i * 0.2);
        serpent.rotation.z = angle;
        serpent.position.set(
          Math.cos(angle) * width * 0.42,
          Math.sin(angle) * height * 0.38,
          0,
        );
      }

      // ⑦ 雷声光暴：整幕恰好两次整屏脉冲（第 0 相与第 2 相主弧峰值处）。
      const blastPhases = [0, 2];
      let blastLevel = 0;
      if (blastPhases.includes(index)) {
        // 窄窗只在主弧峰值附近开，避免与相邻相连成一次长亮。
        const near = Math.max(0, 1 - Math.abs(p - 0.78) / 0.12);
        blastLevel = Math.pow(near, 1.4) * 0.85 * active;
      }
      blast.material.opacity = blastLevel;

      // ⑧ 电荷游灯：沿云底闪烁，放电时整排增辉。
      const lampGain = act1 * (1 - act3 * 0.8);
      for (let i = 0; i < lampBase.length; i += 1) {
        const base = lampBase[i];
        const twinkle = 0.45 + 0.55 * Math.sin(seconds * 6 + base.phase);
        const scale = Math.max(0.001, twinkle * lampGain * (0.7 + Math.max(flash, strike) * 0.9));
        lampMatrix.makeScale(scale, scale, scale);
        lampMatrix.setPosition(base.x, base.y + Math.sin(seconds * 2 + base.phase) * height * 0.01, 0);
        lamps.setMatrixAt(i, lampMatrix);
      }
      lamps.instanceMatrix.needsUpdate = true;
    },

    dispose(): void {
      if (res.disposed) return;
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'lightning',
    title: '雷暴云幕',
    elements: [
      '雷暴乌云', '三相先导电弧', '云内暗闪', '落雷点光池',
      '雨幕', '电弧余波', '雷声光暴', '云缘电荷游灯',
    ],
    signature: '唯一"天象"级场景；先导-暗闪-落雷三相耦合全库唯一',
    preset: 'bolt',
  },
  createLightningStage,
);

export { createLightningStage };
