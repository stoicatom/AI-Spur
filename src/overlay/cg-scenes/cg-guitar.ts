/**
 * 场景 19 guitar（pulse · 声弦，1200ms）。
 *
 * 三幕（规格 §4.2 场景 19）：
 * - 0–250ms    拨弦（六根依次拨响成一记扫弦）
 * - 250–900ms  弦振 + 音浪环×4
 * - 900–1200ms 衰减泛音
 *
 * 互动：①音浪环从音孔扩散并扫亮弦上泛音点——泛音点的亮度由「环的
 * 当前半径是否扫到该点」决定，环没到就不亮；②碎尘随振动脱落——
 * 尘粒发射率由弦振总幅度驱动，弦停尘就停。
 *
 * 独立签名：**唯一「弦振传波」机制**——弦→音孔→环的三段串联传导。
 * 能量不是三层各跑一条曲线，而是下游取上游滞后后的值（见
 * ./guitar-acoustics 的 acousticChain），因此峰值时刻必然依次后移、
 * 切断上游下游必然归零。
 *
 * 元素搭建在 ./guitar-parts，声学链在 ./guitar-acoustics。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { STRING_SEGMENTS, WAVE_RINGS, buildGuitarParts } from './guitar-parts';
import {
  acousticChain,
  stringDisplacement,
  stringEnvelope,
} from './guitar-acoustics';

/** 第一幕结束点（250/1200）。 */
export const GUITAR_ACT1_END = 250 / 1200;
/** 第二幕结束点（900/1200）。 */
export const GUITAR_ACT2_END = 900 / 1200;

/** 四圈音浪环的发出间隔（整幕归一化）。 */
const WAVE_INTERVAL = 0.13;
/** 一圈环从音孔扩到全屏所需的时长（整幕归一化）。 */
const WAVE_TRAVEL = 0.42;

/**
 * 第 index 圈音浪环的当前半径（UV 尺度，纯函数）。
 *
 * 返回 -1 表示该环尚未发出或已越出画面。半径线性外扩：
 * 声速恒定，环不会越走越快。
 *
 * @param t 整幕归一化进度
 * @param index 环序号
 * @param launchBase 第一圈的发出时刻
 */
export function waveRadius(t: number, index: number, launchBase: number): number {
  const launch = launchBase + index * WAVE_INTERVAL;
  const since = t - launch;
  if (since < 0 || since > WAVE_TRAVEL) return -1;
  // 0 → 0.78 覆盖全屏（贴片是 1.5 倍屏幕，0.78 已到屏缘）。
  return (since / WAVE_TRAVEL) * 0.78;
}

/**
 * 环扫到某个泛音点时给出的照亮量（纯函数，互动①的因果本体）。
 *
 * 只有当环的当前半径落在该点半径附近的窄带内才照亮——因此
 * 「环没到就不亮」是曲线本身的性质，不靠调用方按顺序调用保证。
 *
 * @param radius 环当前半径（-1 表示未发出）
 * @param pointRadius 泛音点到音孔的距离（同一 UV 尺度）
 */
export function sweepLight(radius: number, pointRadius: number): number {
  if (radius < 0) return 0;
  const gap = Math.abs(radius - pointRadius);
  // 窄带宽 0.06：环经过时亮一下，过去就暗。
  return Math.max(0, 1 - gap / 0.06);
}

function createGuitarStage(ctx: CgStageContext): CgStage {
  const parts = buildGuitarParts(ctx);
  const {
    res, body, resonance, strings, waves, overtones, pick,
    holeCenter, holeRadius, stringFromX, stringToX, scale,
  } = parts;
  const { width, height } = ctx;

  // ⑧ 碎尘（规格元素⑧）：几何贴片表达不了被震落的微尘。
  const hub = createParticleHub(res.group, ctx.quality);
  const dust = hub.emit({
    count: 72,
    lifetime: [0.4, 1.0],
    speed: [scale * 0.4, scale * 1.6],
    size: [1, 2.8],
    color: new THREE.Color('#E8D3AE'),
    shape: 'cone',
    spread: 0.9,
    position: new THREE.Vector3(holeCenter.x, holeCenter.y - height * 0.1, 3),
    looping: true,
    rate: 44,
  });

  // 第一圈环的发出时刻：第一根弦被拨后，经桥与腔的两级延时。
  const firstPluck = strings[0].pluckAt;
  const waveLaunchBase = firstPluck + 0.05;

  // 弦的顶点缓冲：每帧写入驻波形状。
  const stringSpan = stringToX - stringFromX;
  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, , act3] = acts(t, GUITAR_ACT1_END, GUITAR_ACT2_END);
      // 签名：三段串联的声学链，取第一根弦作为链的输入端。
      const chain = acousticChain(t, firstPluck);

      // 弦振总幅度：驱动琴身抖动与碎尘脱落。
      let stringSum = 0;
      for (const s of strings) stringSum += stringEnvelope(t, s.pluckAt);
      const stringLoad = Math.min(1, stringSum / strings.length);

      // ① 琴身：整幕常在，随弦振轻抖。
      body.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.5);
      body.material.uniforms.uShake.value = stringLoad;

      // ② 琴弦：写入驻波顶点。端点恒为零（两端固定）。
      for (const s of strings) {
        const attr = s.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let k = 0; k <= STRING_SEGMENTS; k += 1) {
          const x = k / STRING_SEGMENTS;
          const disp = stringDisplacement(x, t, s.pluckAt, s.harmonic, s.omega);
          attr.setXYZ(k, stringFromX + stringSpan * x, s.y + disp * s.amp, 0);
        }
        attr.needsUpdate = true;
        s.line.geometry.computeBoundingSphere();
        s.line.material.opacity = Math.min(1, 0.25 + stringEnvelope(t, s.pluckAt) * 1.4);
      }

      // ⑥ 共鸣光：链的第二段，滞后弦振。
      resonance.material.uniforms.uTime.value = seconds;
      resonance.material.uniforms.uAlpha.value = chain.body * 1.1;

      // ④ 音浪环：链的第三段，各圈错峰发出并线性外扩。
      const radii: number[] = [];
      for (let i = 0; i < WAVE_RINGS; i += 1) {
        const wave = waves[i];
        const r = waveRadius(t, i, waveLaunchBase);
        radii.push(r);
        const u = wave.mesh.material.uniforms;
        if (r < 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        u.uRadius.value = r;
        // 环的亮度乘上链的辐射段：弦不振，环就发不出来。
        u.uAlpha.value = chain.radiate * 1.25;
        // 越远的波前越厚（高频先衰减）。
        u.uThickness.value = 0.022 + r * 0.05;
      }

      // 互动① ⑦ 泛音点：环扫到才亮。
      for (const ot of overtones) {
        const s = strings[ot.stringIndex];
        const px = stringFromX + stringSpan * ot.along;
        const disp = stringDisplacement(ot.along, t, s.pluckAt, s.harmonic, s.omega);
        const py = s.y + disp * s.amp;
        ot.dot.position.set(px, py, 6);

        // 该点到音孔的距离，换算成环所用的 UV 尺度。
        const dist = Math.hypot(px - holeCenter.x, py - holeCenter.y);
        const pointRadius = dist / (width * 1.5);
        let lit = 0;
        for (const r of radii) lit = Math.max(lit, sweepLight(r, pointRadius));
        // 末幕「衰减泛音」：环已过，泛音点自身余辉。
        const afterglow = act3 * stringEnvelope(t, s.pluckAt) * 0.5;
        ot.dot.material.opacity = Math.min(1, lit * 0.95 + afterglow);
        ot.dot.scale.setScalar(0.7 + lit * 0.8);
      }

      // ⑤ 拨片闪光：每根弦被拨的瞬间在该弦上闪一下。
      let pickLevel = 0;
      let pickY = strings[0].y;
      for (const s of strings) {
        const since = t - s.pluckAt;
        if (since >= 0 && since < 0.05) {
          const level = 1 - since / 0.05;
          if (level > pickLevel) {
            pickLevel = level;
            pickY = s.y;
          }
        }
      }
      pick.material.opacity = pickLevel * 0.9;
      // 扫弦是从琴桥侧往外扫，拨点略靠音孔一侧。
      pick.position.set(holeCenter.x - holeRadius * 1.6, pickY, 8);
      pick.scale.setScalar(0.6 + pickLevel * 0.9);

      // 互动② 碎尘：发射率由弦振总幅度驱动，弦停尘停。
      if (dust) {
        dust.emissionOverTime = new ConstantValue(4 + stringLoad * 70);
      }
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
    packId: 'guitar',
    title: '声弦',
    elements: [
      '琴身', '琴弦', '弦波传导', '音浪环',
      '拨片闪光', '共鸣光', '泛音点', '碎尘',
    ],
    signature: '唯一"弦振传波"机制（弦→音孔→环层级传导全库唯一）',
    preset: 'pulse',
  },
  createGuitarStage,
);

export { createGuitarStage };
