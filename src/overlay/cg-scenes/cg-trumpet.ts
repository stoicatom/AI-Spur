/**
 * 场景 23 trumpet（ring · 号角鸣奏，1200ms）。
 *
 * 三幕（规格 §4.2 场景 23）：
 * - 0–250ms    吹奏起音
 * - 250–900ms  号口环波×3 + 按键
 * - 900–1200ms 收尾振音
 *
 * 互动：①按键光点每次按下同步号口环波加强——环波幅度由 valveEnergy
 * （三键激励总量）推高，不按键就只剩吹奏底噪；②音符粒子从环波中剥离
 * 上升——发射点锁在当前最外圈环的波前上，且方位落在号口主瓣内。
 *
 * 独立签名：**唯一「吹奏类 + 定向号口」发声方向设计**。与 bell 的
 * 四面扩散相反——bell 的环是均匀同心圆，这里的波被号口约束在一个
 * 朝向轴的扇形里，轴向能量比背向高一个数量级（见 ./trumpet-horn 的
 * hornGain）。
 *
 * 元素搭建在 ./trumpet-parts，方向性与按键数学在 ./trumpet-horn。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildTrumpetParts } from './trumpet-parts';
import {
  HORN_AXIS,
  hornRingRadius,
  noteDetachAngle,
  valveEnergy,
  valveExcite,
} from './trumpet-horn';

/** 第一幕结束点（250/1200）。 */
export const TRUMPET_ACT1_END = 250 / 1200;
/** 第二幕结束点（900/1200）。 */
export const TRUMPET_ACT2_END = 900 / 1200;

/**
 * 共鸣管波的行进位置（纯函数）。
 *
 * 气柱压缩波在管内自喉向口反复行进，周期由吹奏基频给。
 * 返回 0（喉）→1（口）。
 *
 * @param t 整幕归一化进度
 */
export function pipeFront(t: number): number {
  // 每 0.16 幕跑完一趟管长，末幕放缓（收尾振音）。
  return (t / 0.16) % 1;
}

function createTrumpetStage(ctx: CgStageContext): CgStage {
  const parts = buildTrumpetParts(ctx);
  const {
    res, curtain, body, pipe, rings, valves, gleams, goldWash,
    hornMouth, scale,
  } = parts;
  const { width, height } = ctx;

  // ④ 音符粒子（规格元素④）：几何贴片表达不了成串吐出的音符光点。
  const hub = createParticleHub(res.group, ctx.quality);
  const notePosition = new THREE.Vector3(hornMouth.x, hornMouth.y, 2);
  const notes = hub.emit({
    count: 96,
    lifetime: [0.5, 1.1],
    speed: [scale * 1.2, scale * 3.6],
    size: [2.5, 6],
    color: new THREE.Color('#FFE9A8'),
    shape: 'cone',
    spread: 0.5,
    position: notePosition,
    looping: true,
    rate: 58,
  });

  // 音符发射锚点：quarks 的 emitter 会被 BatchedRenderer 从场景树摘走，
  // 锚点让「音符从环波上剥离」可定位、可验收。
  const noteAnchor = new THREE.Object3D();
  noteAnchor.name = 'note-anchor';
  res.group.add(noteAnchor);

  // 环波贴片的半宽（像素），用于把 UV 半径换回场景坐标。
  const ringSpanW = width * 1.5;
  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, TRUMPET_ACT1_END, TRUMPET_ACT2_END);
      // 互动①的驱动量：三键激励总量。
      const valveLoad = valveEnergy(t);
      // 吹奏底噪：整幕都在吹，按键只是让号声更响。
      const blow = Math.min(1, act1 * 1.4) * (1 - act3 * 0.55);

      // ⑧ 背景暖幕
      curtain.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6);
      curtain.material.uniforms.uGlow.value = blow * (0.3 + valveLoad * 0.7);

      // ⑦ 号声金光：整屏暖罩，按键时更盛。
      goldWash.material.uniforms.uAlpha.value = blow * (0.16 + valveLoad * 0.3);

      // ① 喇叭本体：整幕常在，按键时金属更亮。
      body.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.5);
      body.material.uniforms.uGleam.value = 0.3 + valveLoad * 0.7;

      // ⑥ 共鸣管波：自喉向口行进。
      pipe.material.uniforms.uFront.value = pipeFront(t);
      pipe.material.uniforms.uAlpha.value = blow * (0.35 + valveLoad * 0.5);

      // ② 互动① 号口环波：幅度由按键激励推高。
      let outerRadius = -1;
      for (const ring of rings) {
        const r = hornRingRadius(t, ring.index);
        const u = ring.mesh.material.uniforms;
        if (r < 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        u.uRadius.value = r;
        // 基底只给很小一层，主要幅度来自按键——「加强」因此可测。
        u.uAlpha.value = (0.12 + valveLoad * 0.88) * blow * 1.2;
        u.uThickness.value = 0.02 + r * 0.045;
        if (r > outerRadius) outerRadius = r;
      }

      // ③ 按键光点：各自按下时亮起。
      for (const valve of valves) {
        const excite = valveExcite(t, valve.index);
        valve.dot.material.opacity = Math.min(1, 0.1 * act1 + excite * 0.9);
        valve.dot.scale.setScalar(0.75 + excite * 0.5);
      }

      // ⑤ 金属光泽：沿管身流动的反光，按键时更亮。
      for (let i = 0; i < gleams.length; i += 1) {
        const phase = seconds * 1.6 + i * 1.3;
        gleams[i].material.opacity = blow * (0.18 + valveLoad * 0.35)
          * (0.5 + 0.5 * Math.sin(phase));
      }

      // 互动② 音符粒子从环波波前剥离：发射点锁在最外圈环上。
      if (outerRadius > 0) {
        // UV 半径换回场景坐标（贴片 1.5 倍屏宽）。
        const radiusPx = outerRadius * ringSpanW;
        const angle = noteDetachAngle(Math.sin(seconds * 2.7));
        notePosition.set(
          hornMouth.x + Math.cos(angle) * radiusPx,
          hornMouth.y + Math.sin(angle) * radiusPx,
          2,
        );
      } else {
        // 没有环在飞时，音符从号口本身吐出。
        notePosition.set(hornMouth.x, hornMouth.y, 2);
      }
      noteAnchor.position.copy(notePosition);
      if (notes) {
        notes.emitter.position.copy(notePosition);
        // 第二幕吐音最盛，且跟着按键走。
        notes.emissionOverTime = new ConstantValue(6 + act2 * 50 + valveLoad * 60);
      }

      // 屏宽兜底：幕布与环波贴片都已按倍数建，无需再缩放。
      void height;
      void HORN_AXIS;
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
    packId: 'trumpet',
    title: '号角鸣奏',
    elements: [
      '喇叭', '号口音波', '按键光点', '音符粒子',
      '金属光泽', '共鸣管波', '号声金光', '背景暖幕',
    ],
    signature: '唯一"吹奏类+定向号口"发声方向设计（与 bell 的四面扩散不同）',
    preset: 'ring',
  },
  createTrumpetStage,
);

export { createTrumpetStage };
