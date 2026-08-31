/**
 * 场景 38 piano（note-dance · 琴键狂想，1800ms）。
 *
 * 三幕（规格 §4.2 场景 38）：
 * - 0–400ms     起奏（踏板踩下，琴身就位）
 * - 400–1350ms  键闪 + 音符舞 + 五线谱
 * - 1350–1800ms 尾声渐弱
 *
 * 互动：①**音符跳完才成尘**——音尘的发射率读 `noteDustFall` 之和，
 * 所以尘一定晚于音符落地，改跳数会让起尘时刻跟着动；②**键闪与音符
 * 逐一配对**——第 i 个键的闪光与第 `keyToNote(i)` 个音符共用同一个
 * 击键时刻，两者不可能各弹各的。
 *
 * 独立签名：**唯一「旋律演奏」叙事；键盘连击与音符逐一配对**。与六个
 * 已完成音乐场景（guitar 弦振、drum 击打、bell 驻波、trumpet 号口、
 * harp 拨弦、vinyl 旋转载体）的分野在**激励与响应的基数**：那些是
 * 一次激励换一片响应，本场景是 n 次激励换 n 个响应且互为逆映射。
 *
 * 与场景 39 saxophone 的分野在音符的走法：本场景**跃动**（抛物线段
 * 拼接，竖向速度在落点换号），saxophone **摇曳**（水平振荡、竖向严格
 * 单调上升）。
 *
 * 元素搭建在 ./piano-parts，音尘在 ./piano-dust，签名数学在
 * ./piano-melody 与 ./piano-notes。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildPianoParts } from './piano-parts';
import { createDustLayer } from './piano-dust';
import {
  KEY_STRIKE_COUNT,
  PIANO_ACT1_END,
  PIANO_ACT2_END,
  keyFlash,
  melodyDensity,
  pedalGlow,
  soundboardGlow,
} from './piano-melody';
import {
  noteHeight,
  noteHopPhase,
  noteShape,
  noteX,
  staffLineGlow,
} from './piano-notes';

export { PIANO_ACT1_END, PIANO_ACT2_END };

function createPianoStage(ctx: CgStageContext): CgStage {
  const parts = buildPianoParts(ctx);
  const dust = createDustLayer(parts.res.group, ctx, parts.short);

  // 音符形状在建件后一次写死：形状是音符身份的一部分（由序号决定），
  // 不随时间变。放在 update 里每帧重写等于允许它变，那就不是「同一个
  // 音符」了。
  for (let n = 0; n < parts.notes.length; n += 1) {
    parts.notes[n].material.uniforms.uShape.value = noteShape(n);
  }

  const seat = new THREE.Vector3();
  let last = 0;

  return {
    update(t, elapsedMs): void {
      if (parts.res.disposed) return;
      const delta = frameDelta(elapsedMs, last);
      last = elapsedMs;

      const [, , act3] = acts(t, PIANO_ACT1_END, PIANO_ACT2_END);
      // 尾声渐弱：整场亮度在第三幕统一收，不各元素分别写一遍。
      const fade = 1 - act3 * 0.72;

      // ① 琴身 + ② 键闪：逐键写入 uniform 数组。数组实例不换，只改元素
      // ——换数组会让 three 重新分配 uniform，白扔一次上传。
      const flashes = parts.body.material.uniforms.uKeyFlash.value as number[];
      for (let i = 0; i < KEY_STRIKE_COUNT; i += 1) {
        flashes[i] = keyFlash(i, t);
      }
      // ⑥ 共鸣板光：读余响包络，比键闪钝得多。
      parts.body.material.uniforms.uBoardGlow.value = soundboardGlow(t) * fade;

      // ③ 音符精灵：位置由 noteX / noteHeight 给出，跃动的抛物线拼接
      // 就在 noteHeight 里，本层只做像素换算。
      const band = parts.noteBandY1 - parts.noteBandY0;
      for (let n = 0; n < parts.notes.length; n += 1) {
        const mesh = parts.notes[n];
        const phase = noteHopPhase(n, t);
        const h = noteHeight(n, t);
        mesh.position.set(
          (noteX(n, t) - 0.5) * parts.width,
          parts.noteBandY0 + h * band,
          mesh.position.z,
        );
        // 起跳前不可见；跳完后随坠落淡出。
        const alive = phase > 0 ? Math.min(1, phase * 6) : 0;
        mesh.material.uniforms.uAlpha.value = alive * fade;
        // 翻转角读跳数：每跳转半圈，落点处正好回正。
        mesh.material.uniforms.uSpin.value = phase * Math.PI;
      }

      // ④ 五线谱线：亮度读「有音符落在附近」，谱线是被音符点亮的。
      for (let j = 0; j < parts.staff.length; j += 1) {
        parts.staff[j].material.uniforms.uGlow.value = staffLineGlow(j, t) * fade;
      }

      // ⑤ 踏板辉光：一条包络，整个演奏段保持。
      parts.pedal.material.uniforms.uIntensity.value = pedalGlow(t);

      // ⑦ 节拍闪烁：读旋律密度，与键闪同源。
      parts.beat.material.uniforms.uIntensity.value = melodyDensity(t) * 0.34 * fade;

      // ⑧ 音尘：落尘点在键面，横向跟着最近落下的音符走。
      seat.set(0, parts.keyTopY, -3);
      dust.advance(t, delta, seat);
    },

    dispose(): void {
      dust.dispose();
      parts.res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'piano',
    title: '琴键狂想',
    elements: ['琴身 mesh', '键闪', '音符精灵', '五线谱线', '踏板辉光', '共鸣板光', '节拍闪烁', '琴键落下激起音尘'],
    signature: '唯一"旋律演奏"叙事；键盘连击与音符逐一配对（全库唯一）',
    preset: 'note-dance',
  },
  createPianoStage,
);
