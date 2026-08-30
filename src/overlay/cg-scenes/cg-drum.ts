/**
 * 场景 20 drum（drum-beat · 战鼓重击，1200ms）。
 *
 * 三幕（规格 §4.2 场景 20）：
 * - 0–150ms    槌落（鼓槌加速抡下，触面）
 * - 150–700ms  鼓面震荡 + 环波 + 震屏
 * - 700–1200ms 余震衰减
 *
 * 互动：①鼓面凹陷与环波同帧——环的强度直接取鼓面位移的绝对值
 * （见 ./drum-impact 的 rippleDrive），不是另跑一条正弦，两者峰值时刻
 * 因此严格相同；②鼓皮粒子被环波推远——波前扫过粒子所在半径时才施加
 * 沿面外推的加速度，环没到就不推。
 *
 * 独立签名：**唯一「击打-凹陷-反弹」机制；鼓槌飞入 + 震屏全库唯一**。
 * 鼓面是真形变网格（顶点按碗形剖面下沉再冲过平面外鼓），环波、震屏、
 * 拖影、火星全部是同一条位移曲线的派生量。震屏与 meteor 的屏幕微震荡
 * 虽同为位移整个 group，机制不同：meteor 是坠地一次冲击后单调衰减，
 * drum 的包络由鼓面回弹重新拉起，是**多次余震**。
 *
 * 元素搭建在 ./drum-parts，签名曲线在 ./drum-impact，粒子物理在 ./drum-skin。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import {
  DRUM_STRIKE_AT,
  boomSmear,
  dentDepth,
  drumQuakeAmount,
  headDeflection,
  malletApproach,
  malletRecoil,
  rippleDrive,
  rippleRadii,
  rippleRadius,
} from './drum-impact';
import {
  DRUM_SQUASH,
  HEAD_SEGMENTS,
  buildDrumParts,
  bowlProfile,
} from './drum-parts';
import { createSkinField } from './drum-skin';

/** 第一幕结束点（150/1200）＝击打时刻。 */
export const DRUM_ACT1_END = DRUM_STRIKE_AT;
/** 第二幕结束点（700/1200）。 */
export const DRUM_ACT2_END = 700 / 1200;

function createDrumStage(ctx: CgStageContext): CgStage {
  const parts = buildDrumParts(ctx);
  const {
    res, body, mallet, head, headRest, ripples, smear, sparkAnchor,
    headRadius, dentDepth: maxDent, malletFrom, strikePoint, scale,
  } = parts;

  // ⑧ 锤头火星：几何贴片表达不了击点迸出的火花。
  const hub = createParticleHub(res.group, ctx.quality);
  const sparkPos = new THREE.Vector3().copy(strikePoint);
  const sparks = hub.emit({
    count: 96,
    lifetime: [0.18, 0.5],
    speed: [scale * 1.5, scale * 6],
    size: [1.2, 3.6],
    color: new THREE.Color('#FFD08A'),
    shape: 'cone',
    spread: 0.85,
    position: sparkPos,
    looping: true,
    rate: 0,
  });

  // ⑤ 鼓皮粒子：沿鼓面弹跳的刚体场。
  const skin = createSkinField(res, ctx, headRadius, scale);

  const headAttr = head.geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = (HEAD_SEGMENTS + 1) * (HEAD_SEGMENTS + 1);
  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, , act3] = acts(t, DRUM_ACT1_END, DRUM_ACT2_END);

      // 签名核心：一条鼓面位移曲线，下面所有量都是它的派生。
      const deflect = headDeflection(t);
      const dent = dentDepth(t);
      const drive = rippleDrive(t);

      // 签名·震屏：位移整个场景 group。包络由鼓面位移驱动，
      // 鼓面每回弹一次震屏就被重新拉起一次（余震，非单次冲击）。
      const quake = drumQuakeAmount(t);
      res.group.position.set(
        ctx.origin.x + Math.sin(seconds * 83) * quake * scale * 0.85,
        ctx.origin.y + Math.cos(seconds * 71) * quake * scale * 0.6,
        ctx.origin.z,
      );

      // ① 鼓身：整幕常在，受击时漆面剪切。
      body.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6 + 0.15);
      body.material.uniforms.uShake.value = Math.abs(deflect);

      // ③ 鼓面冲击：顶点按碗形剖面真下沉，反弹时冲过平面外鼓。
      // 每帧从静止位形重算，避免误差累积。
      for (let i = 0; i < vertexCount; i += 1) {
        const rx = headRest[i * 3];
        const ry = headRest[i * 3 + 1];
        const u = Math.hypot(rx, ry) / headRadius;
        // z 是离面方向：正 deflect = 压进去（-z）。
        headAttr.setXYZ(i, rx, ry, -deflect * maxDent * bowlProfile(u));
      }
      headAttr.needsUpdate = true;
      head.geometry.computeBoundingSphere();
      head.material.uniforms.uDent.value = deflect;
      head.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6 + 0.15);

      // ② 鼓槌：加速抡入 → 触面 → 弹开回撤。
      const approach = malletApproach(t);
      const recoil = malletRecoil(t);
      const back = 0.42 * recoil;
      mallet.position.set(
        malletFrom.x + (strikePoint.x - malletFrom.x) * approach
          + (malletFrom.x - strikePoint.x) * back,
        malletFrom.y + (strikePoint.y - malletFrom.y) * approach
          + (malletFrom.y - strikePoint.y) * back
          // 触面后槌头随鼓面一起被压下去再顶起来。
          - deflect * maxDent * 0.55,
        malletFrom.z + (strikePoint.z - malletFrom.z) * approach,
      );
      // 抡下的过程里槌柄从斜举转到近竖直。
      mallet.rotation.z = (1 - approach) * 0.85 - recoil * 0.5;
      for (const part of mallet.children) {
        const m = (part as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = Math.min(1, 0.25 + approach * 0.75) * (1 - act3 * 0.75);
      }

      // ④ 互动① 低频环波：强度直接取鼓面位移，与凹陷同帧达峰。
      for (let i = 0; i < ripples.length; i += 1) {
        const u = ripples[i].material.uniforms;
        const r = rippleRadius(t, i);
        if (r < 0) {
          u.uAlpha.value = 0;
          u.uRadius.value = 0;
          continue;
        }
        u.uRadius.value = r;
        // 外层稍弱：层间递减 15%。
        u.uAlpha.value = drive * 1.35 * (1 - i * 0.15);
      }

      // ⑦ 音浪拖影：延迟线平均，比凹陷晚散。
      smear.material.uniforms.uTime.value = seconds;
      smear.material.uniforms.uAlpha.value = boomSmear(t) * 0.75;

      // ⑤ 互动② 鼓皮粒子：环波半径按函数传入，追赶循环内逐步采样。
      skin.advance(t, (sceneT) => rippleRadii(sceneT));
      skin.setOpacity(t < DRUM_STRIKE_AT ? 0 : Math.min(0.95, 0.35 + dent * 1.6) * (1 - act3 * 0.55));

      // ⑧ 锤头火星：击点迸出，发射率由凹陷量驱动（不凹陷就没火星）。
      sparkPos.set(strikePoint.x, strikePoint.y - deflect * maxDent * DRUM_SQUASH, strikePoint.z);
      sparkAnchor.position.copy(sparkPos);
      if (sparks) {
        sparks.emitter.position.copy(sparkPos);
        sparks.emissionOverTime = new ConstantValue(dent * 340);
      }
    },

    dispose(): void {
      if (res.disposed) return;
      skin.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'drum',
    title: '战鼓重击',
    elements: [
      '鼓身 mesh', '鼓槌', '鼓面冲击', '低频环波',
      '鼓皮粒子', '震屏', '音浪拖影', '锤头火星',
    ],
    signature: '唯一"击打-凹陷-反弹"机制；鼓槌飞入+震屏全库唯一',
    preset: 'drum-beat',
  },
  createDrumStage,
);

export { createDrumStage };
