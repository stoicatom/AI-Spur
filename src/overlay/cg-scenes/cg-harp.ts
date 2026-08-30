/**
 * 场景 22 harp（petal · 竖琴花瓣，1200ms）。
 *
 * 三幕（规格 §4.2 场景 22）：
 * - 0–300ms    拨弦闪光（一道亮带自上而下扫过弦列）
 * - 300–900ms  花瓣音波 + 下滑
 * - 900–1200ms 落地涟漪
 *
 * 互动：①拨弦闪光扫过时弦列依次亮起——弦的亮度由「闪光带此刻的位置
 * 是否扫到这根弦」决定（**空间驱动**），不是每根弦自己的计时器；
 * ②花瓣音波落地起涟漪——每圈晕环绑定一片花瓣，启动时刻取自那片花瓣
 * 的**触地进度**，改花瓣轨迹涟漪就跟着改。
 *
 * 独立签名：**唯一「竖列弦 + 花瓣波」组合；拨弦闪光逐列扫描全库唯一**。
 * 与 guitar 的区分在驱动量：guitar 的六弦按各自 pluckAt 时刻错峰响
 * （时间驱动的扫弦），harp 是一道移动的光带照亮空间上排开的弦列。
 *
 * 元素搭建在 ./harp-parts，扫描与花瓣轨迹的数学在 ./harp-petals。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildHarpParts } from './harp-parts';
import {
  beamLight,
  beamPosition,
  petalPath,
  stringRing,
} from './harp-petals';

/** 第一幕结束点（300/1200）。 */
export const HARP_ACT1_END = 300 / 1200;
/** 第二幕结束点（900/1200）。 */
export const HARP_ACT2_END = 900 / 1200;

/** 单片花瓣从剥落到触地所需的幕比例。 */
export const PETAL_FALL_SPAN = 0.34;

/**
 * 某片花瓣的下落进度（纯函数）。
 *
 * 返回 -1 表示尚未剥落，返回 >=1 表示已触地。
 *
 * @param t 整幕归一化进度
 * @param at 该片的剥落时刻
 */
export function petalProgress(t: number, at: number): number {
  const since = t - at;
  if (since < 0) return -1;
  return since / PETAL_FALL_SPAN;
}

function createHarpStage(ctx: CgStageContext): CgStage {
  const parts = buildHarpParts(ctx);
  const { res, night, frame, beam, strings, petals, halos, groundY, scale } = parts;
  const { width, height } = ctx;

  // ③ 花瓣音波（规格元素③）：从弦上剥落的花瓣形轨迹粒子。
  // 几何贴片只能表达数得清的几片，成片的音波必须交给 quarks。
  const hub = createParticleHub(res.group, ctx.quality);
  const wavePosition = new THREE.Vector3(strings[0].x, strings[0].topY, 1);
  const waveSystem = hub.emit({
    count: 108,
    lifetime: [0.5, 1.2],
    speed: [scale * 0.6, scale * 2.4],
    size: [2, 5],
    color: new THREE.Color('#FFD9E8'),
    shape: 'cone',
    spread: 0.7,
    position: wavePosition,
    looping: true,
    rate: 76,
  });

  // 音波发射锚点：quarks 的 emitter 会被 BatchedRenderer 从场景树摘走，
  // 锚点让「音波从闪光扫到的弦上剥落」可定位、可验收。
  const waveAnchor = new THREE.Object3D();
  waveAnchor.name = 'petalwave-anchor';
  res.group.add(waveAnchor);

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, HARP_ACT1_END, HARP_ACT2_END);
      const beamPos = beamPosition(t);

      // ⑤ 月夜景：整幕常在。
      night.material.uniforms.uTime.value = seconds;
      night.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6);

      // ① + ⑦ 框架与琴柱辉光：闪光扫过时整架跟着亮一层。
      frame.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.5);
      // 辉光在闪光扫描期最盛，之后随余振缓落。
      const sweeping = beamPos <= 1 ? 1 : 0;
      frame.material.uniforms.uGlow.value = 0.25 + sweeping * 0.55 + act2 * 0.2;

      // ④ 拨弦闪光带：位置由 beamPosition 驱动。
      beam.material.uniforms.uBeam.value = Math.min(1.2, beamPos);
      // 扫完即隐（超出弦列后不再有光带）。
      beam.material.uniforms.uAlpha.value = beamPos <= 1.05 ? 0.9 * Math.min(1, act1 * 3) : 0;

      // 互动① ② 竖列弦：亮度由闪光带位置决定（空间驱动）。
      let litString = strings[0];
      let brightest = -1;
      for (const s of strings) {
        const lit = beamLight(beamPos, s.pos);
        // 首次被扫到时记下时刻，之后按余振包络自行衰减。
        if (lit > 0.05 && s.litAt < 0) s.litAt = t;
        const ring = s.litAt >= 0 ? stringRing(t, s.litAt) : 0;
        // 亮度 = 被照亮的瞬时 + 余振。两者都源自「被扫到」这件事。
        s.line.material.opacity = Math.min(1, 0.12 * act1 + lit * 0.85 + ring * 0.55);
        if (lit > brightest) {
          brightest = lit;
          litString = s;
        }
      }

      // ③ 花瓣音波发射点：跟着当前最亮的弦（即闪光带所在处）。
      wavePosition.set(litString.x, (litString.topY + litString.bottomY) / 2, 1);
      waveAnchor.position.copy(wavePosition);
      if (waveSystem) {
        waveSystem.emitter.position.copy(wavePosition);
        // 第二幕音波最盛（规格「花瓣音波+下滑」）。
        waveSystem.emissionOverTime = new ConstantValue(6 + act2 * 88 * (1 - act3 * 0.6));
      }

      // ⑧ 飘落花瓣：沿 petalPath 的螺旋下坠轨迹。
      for (const petal of petals) {
        const p = petalProgress(t, petal.at);
        if (p < 0) {
          petal.mesh.material.opacity = 0;
          continue;
        }
        const clamped = Math.min(1, p);
        const point = petalPath(clamped, petal.fall, petal.swayAmp, petal.swayPhase, petal.spin);
        petal.mesh.position.set(petal.from.x + point.x, petal.from.y + point.y, 3);
        petal.mesh.rotation.z = point.angle;
        // 触地后贴地淡出。
        petal.mesh.material.opacity = p >= 1
          ? Math.max(0, 1 - (p - 1) * 3) * 0.7
          : Math.min(1, p * 6) * 0.9;
      }

      // 互动② ⑥ 落地晕环：由绑定花瓣的触地时刻激起。
      for (const halo of halos) {
        const petal = petals[halo.petalIndex];
        const p = petalProgress(t, petal.at);
        // 只有那片花瓣真的触地（p>=1）之后才起涟漪。
        const since = p - 1;
        if (since < 0) {
          halo.mesh.material.opacity = 0;
          continue;
        }
        // 涟漪落点就是那片花瓣的触地横坐标。
        const landing = petalPath(1, petal.fall, petal.swayAmp, petal.swayPhase, petal.spin);
        halo.mesh.position.set(petal.from.x + landing.x, groundY, 2);
        const local = Math.min(1, since * 2.4);
        halo.mesh.material.opacity = Math.sin(local * Math.PI) * 0.6;
        const spread = 1 + local * 2.2;
        halo.mesh.scale.set(spread, 0.3 * spread, 1);
      }

      // 屏宽兜底：夜幕已按 1.2 倍屏幕建，无需再缩放。
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
    packId: 'harp',
    title: '竖琴花瓣',
    elements: [
      '竖琴框架', '琴弦', '花瓣音波', '拨弦闪光',
      '月夜景', '落地晕环', '琴柱辉光', '飘落花瓣',
    ],
    signature: '唯一"竖列弦+花瓣波"组合；拨弦闪光逐列扫描全库唯一',
    preset: 'petal',
  },
  createHarpStage,
);

export { createHarpStage };
