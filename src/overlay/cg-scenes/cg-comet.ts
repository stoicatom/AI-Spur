/**
 * 场景 18 comet（trail-burst · 彗星掠日，1200ms）。
 *
 * 三幕（规格 §4.2 场景 18）：
 * - 0–250ms    接近
 * - 250–750ms  掠日 + 尾绽放
 * - 750–1200ms 远去尾拖长
 *
 * 互动：①近日点闪光瞬间尾迹断裂重新生长——闪光峰值那一刻 uBreak
 * 跳到最高，随后回落，尾在视觉上断开再连起来；②日球风推弯尘埃尾——
 * 尘埃尾的滞后强度 lag 由日球风强度驱动，风越强尾越弯。
 *
 * 独立签名：**唯一「双向彗尾」的物理区分**。离子尾严格背日呈直线
 * （太阳风沿磁场线加速电离气体），尘埃尾因保留轨道速度而弯曲——
 * 两条尾的形状差异写在 ./comet-tails 的纯函数里，可直接验收。
 * 与 meteor 同为天体但机制相反：meteor 在大气里有激波与迎风面高温，
 * comet 在真空中只有太阳风与光压。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildCometParts } from './comet-parts';
import {
  TAIL_SEGMENTS,
  buildTailGeometry,
  dustTailPoint,
  ionTailPoint,
} from './comet-tails';

/** 第一幕结束点（250/1200）。 */
export const COMET_ACT1_END = 250 / 1200;
/** 第二幕结束点（750/1200）。 */
export const COMET_ACT2_END = 750 / 1200;

/** 尘埃尾滞后系数的基底与风驱动幅度：lag = BASE + wind * GAIN。 */
export const DUST_LAG_BASE = 0.25;
export const DUST_LAG_GAIN = 0.85;

/**
 * 彗星在轨道上的位置（纯函数）。
 *
 * 沿二次贝塞尔从入射点经近日点到出射点——真实彗星轨道是圆锥曲线，
 * 贝塞尔在一幕的尺度上足够近似，且让近日点严格落在 act2 中段。
 *
 * @param t 整幕归一化进度
 * @param entry 入射点
 * @param perihelion 近日点（贝塞尔控制点方向）
 * @param exit 出射点
 */
export function orbitPoint(
  t: number,
  entry: THREE.Vector2,
  perihelion: THREE.Vector2,
  exit: THREE.Vector2,
): THREE.Vector2 {
  const k = Math.min(1, Math.max(0, t));
  // 控制点抬高，让曲线真的经过近日点附近而非只被它拉一下。
  const cx = perihelion.x * 2 - (entry.x + exit.x) * 0.5;
  const cy = perihelion.y * 2 - (entry.y + exit.y) * 0.5;
  const m = 1 - k;
  return new THREE.Vector2(
    m * m * entry.x + 2 * m * k * cx + k * k * exit.x,
    m * m * entry.y + 2 * m * k * cy + k * k * exit.y,
  );
}

/**
 * 日球风强度（纯函数）：近日点最强，两侧衰减。
 *
 * 这是互动②的驱动量——尘埃尾的滞后系数由它决定，风越强尾越弯。
 *
 * @param t 整幕归一化进度
 */
export function solarWindStrength(t: number): number {
  // 近日点在 act2 中点，即整幕的 (act1End+act2End)/2。
  const peak = (COMET_ACT1_END + COMET_ACT2_END) / 2;
  const d = Math.abs(t - peak);
  return Math.exp(-Math.pow(d / 0.26, 2));
}

/**
 * 尘埃尾滞后系数（纯函数，互动②的因果链本体）。
 *
 * 单独导出让验收可以直接量「风强 → 滞后」这一步，不必从几何反解：
 * 反解受尾长与三角带宽度干扰，在低风短尾时误差可达 3.6 倍，
 * 足以让「lag 写成常量」的实现照样通过反解式断言。
 *
 * @param t 整幕归一化进度
 */
export function dustLagAt(t: number): number {
  return DUST_LAG_BASE + solarWindStrength(t) * DUST_LAG_GAIN;
}

/** 尾长：近日点最长（挥发最剧烈），远去后仍拖长但变淡。 */
function tailLength(t: number, scale: number): number {
  const [act1, , act3] = acts(t, COMET_ACT1_END, COMET_ACT2_END);
  const wind = solarWindStrength(t);
  return scale * (3 + act1 * 6 + wind * 10 + act3 * 6);
}

function createCometStage(ctx: CgStageContext): CgStage {
  const parts = buildCometParts(ctx);
  const {
    res, core, ionTail, dustTail, flash, starField, wakes, sparkles,
    entry, perihelion, exit, sun, scale,
  } = parts;
  const { width, height } = ctx;

  // ⑦ 日球风（规格元素⑦）：横向粒子流，几何贴片表达不了流场。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 96,
    lifetime: [0.6, 1.3],
    speed: [width * 0.2, width * 0.5],
    size: [1, 2.8],
    color: new THREE.Color('#BFE6FF'),
    shape: 'sphere',
    spread: height * 0.5,
    position: new THREE.Vector3(sun.x, sun.y, -5),
    looping: true,
    rate: 72,
  });

  let lastNow = ctx.now;
  const sunDir = new THREE.Vector2();
  const orbitDir = new THREE.Vector2();
  const ionPoints: THREE.Vector2[] = [];
  const dustPoints: THREE.Vector2[] = [];

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, , act3] = acts(t, COMET_ACT1_END, COMET_ACT2_END);
      const wind = solarWindStrength(t);

      // 轨道位置与两个方向：背日方向定尾向，轨道方向定尘埃尾滞后。
      const pos = orbitPoint(t, entry, perihelion, exit);
      const ahead = orbitPoint(Math.min(1, t + 0.01), entry, perihelion, exit);
      orbitDir.set(ahead.x - pos.x, ahead.y - pos.y);
      if (orbitDir.lengthSq() < 1e-9) orbitDir.set(1, 0);
      orbitDir.normalize();
      sunDir.set(sun.x - pos.x, sun.y - pos.y);
      if (sunDir.lengthSq() < 1e-9) sunDir.set(1, 0);
      sunDir.normalize();

      // ① 彗核
      core.position.set(pos.x, pos.y, 0);
      core.material.opacity = Math.min(1, act1 * 1.6) * (1 - act3 * 0.35);
      // 近日点核最亮最大（挥发最剧）。
      core.scale.setScalar(0.8 + wind * 0.7);

      // ② 双尾：几何每帧按纯函数重建。签名的可验收核心。
      const length = tailLength(t, scale);
      // 互动② 日球风推弯尘埃尾：滞后系数由风强驱动。
      const lag = dustLagAt(t);

      ionPoints.length = 0;
      dustPoints.length = 0;
      for (let i = 0; i < TAIL_SEGMENTS; i += 1) {
        ionPoints.push(ionTailPoint(i, sunDir, length));
        dustPoints.push(dustTailPoint(i, sunDir, orbitDir, length, lag));
      }

      // 旧几何要显式释放：每帧重建，不释放会持续泄漏 GPU buffer。
      ionTail.geometry.dispose();
      ionTail.geometry = buildTailGeometry(ionPoints, scale * 0.3, scale * 0.12);
      dustTail.geometry.dispose();
      dustTail.geometry = buildTailGeometry(dustPoints, scale * 0.36, scale * 0.9);
      ionTail.position.set(pos.x, pos.y, -2);
      dustTail.position.set(pos.x, pos.y, -3);

      // ③ 近日点闪光：风强达峰那一刻爆闪。
      const flashLevel = Math.pow(wind, 6) * 0.95;
      flash.material.uniforms.uAlpha.value = flashLevel;

      // ④ 互动① 尾迹断裂：闪光峰值时断裂最深，随后重新长起。
      const breakDepth = Math.pow(wind, 4) * 0.9;
      ionTail.material.uniforms.uTime.value = seconds;
      ionTail.material.uniforms.uBreak.value = breakDepth;
      ionTail.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.3) * (0.45 + wind * 0.55);
      dustTail.material.uniforms.uTime.value = seconds;
      // 尘埃尾断裂较浅：颗粒不受磁场丝断裂影响那么剧烈。
      dustTail.material.uniforms.uBreak.value = breakDepth * 0.45;
      dustTail.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.3) * (0.4 + wind * 0.45);

      // ⑤ 星空：整幕常在，近日点被闪光压暗（曝光感）。
      starField.material.uniforms.uTime.value = seconds;
      starField.material.uniforms.uAlpha.value = 0.5 * act1 * (1 - flashLevel * 0.6);

      // ⑥ 拖尾环：定在轨迹上彗星走过的位置，随时间淡出。
      for (const wake of wakes) {
        const p = orbitPoint(wake.at, entry, perihelion, exit);
        wake.mesh.position.set(p.x, p.y, -4);
        // 只有彗星已经经过的环才可见，之后逐渐淡。
        const age = t - wake.at;
        wake.mesh.material.opacity = age > 0 ? Math.exp(-age * 2.6) * 0.5 : 0;
        wake.mesh.scale.setScalar(1 + Math.max(0, age) * 1.8);
      }

      // ⑧ 尾梢爆星：沿尘埃尾靠尾梢处错峰起爆。
      for (const sparkle of sparkles) {
        const local = (t - sparkle.at) / 0.18;
        const alive = local > 0 && local < 1;
        sparkle.mesh.material.opacity = alive ? Math.sin(local * Math.PI) * 0.85 : 0;
        if (alive) {
          const idx = Math.min(TAIL_SEGMENTS - 1, Math.floor(sparkle.along * (TAIL_SEGMENTS - 1)));
          const offset = dustPoints[idx];
          sparkle.mesh.position.set(pos.x + offset.x, pos.y + offset.y, -1);
          sparkle.mesh.scale.setScalar(0.6 + local * 1.6);
        }
      }
    },

    dispose(): void {
      if (res.disposed) return;
      // 每帧重建的几何不在 res 的登记表里，要单独释放。
      ionTail.geometry.dispose();
      dustTail.geometry.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'comet',
    title: '彗星掠日',
    elements: [
      '彗核', '双向彗尾', '近日点闪光', '尾迹断裂',
      '星空粒子', '拖尾环', '日球风', '尾梢爆星',
    ],
    signature: '唯一"双向彗尾（离子+尘埃）"物理区分；与 meteor 的"再入火鞘"同为天体但机制完全不同',
    preset: 'trail-burst',
  },
  createCometStage,
);

export { createCometStage };
