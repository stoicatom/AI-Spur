/**
 * 场景 39 saxophone（note-dance · 爵士萨克斯，1800ms）。
 *
 * 三幕（规格 §4.2 场景 39）：
 * - 0–400ms     起吹（呼吸渐强，舞台灯点亮）
 * - 400–1350ms  按键流光 + 音符摇曳 + 光束交叉
 * - 1350–1800ms 收尾（呼吸渐弱，光退去）
 *
 * 互动：①**摇摆幅度随旋律强弱变化**——`noteSway` 的幅度因子直接乘
 * `melodyIntensity`，所以「旋律强 → 摆得开」是同一个量的两次使用；
 * ②**光束随音符密度摆动**——`beamAngle` 读同一条强度包络。
 *
 * 独立签名：**唯一「慵懒摇曳」**。与 piano（场景 38）的分野在音符走法：
 * piano **跃动**（抛物线段拼接，竖向速度在落点换号），本场景**摇曳**
 *（竖向严格单调光滑上升、水平反复过零）。与 trumpet（场景 23）的分野
 * 在发声方向：trumpet 沿号口**定向喷出**，本场景从管口**飘出后左右摆**。
 *
 * 元素搭建在 ./sax-parts，热雾在 ./sax-mist，签名数学在 ./sax-sway。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildSaxParts } from './sax-parts';
import { createMistLayer } from './sax-mist';
import {
  SAX_ACT1_END,
  SAX_ACT2_END,
  SAX_BEAM_COUNT,
  SAX_KEY_COUNT,
  beamAngle,
  breathMist,
  drumPulse,
  keyLight,
  melodyIntensity,
  noteFade,
  noteProgress,
  noteRise,
  noteSway,
} from './sax-sway';

export { SAX_ACT1_END, SAX_ACT2_END };

/** 音符活动区：管口 y 到上半屏顶的像素高度。 */
const NOTE_BAND_FRAC = 0.44;

function createSaxophoneStage(ctx: CgStageContext): CgStage {
  const parts = buildSaxParts(ctx);
  const mist = createMistLayer(parts.res.group, ctx, parts.short);

  // 音符横向可用幅：管口右侧的活动带，音符从这里飘向屏幕右上。
  const swayAmpX = parts.width * 0.3;
  const bandTop = parts.bellY + ctx.height * NOTE_BAND_FRAC;
  let last = 0;

  return {
    update(t, elapsedMs): void {
      if (parts.res.disposed) return;
      const delta = frameDelta(elapsedMs, last);
      last = elapsedMs;

      const [, , act3] = acts(t, SAX_ACT1_END, SAX_ACT2_END);
      // 收尾：整场亮度统一收，不各元素分别写一遍。
      const fade = 1 - act3 * 0.66;
      const intensity = melodyIntensity(t);

      // ⑦ 舞台暗幕 + ⑥ 鼓点光：背景恒定，只随拍与收尾变。
      parts.stage.material.uniforms.uPulse.value = drumPulse(t) * fade;
      parts.stage.material.uniforms.uAlpha.value = 1 - act3 * 0.25;

      // ⑧ 摇摆光束：绕各自顶点反相摆动，交叉在管口上方。
      for (let b = 0; b < SAX_BEAM_COUNT; b += 1) {
        parts.beamPivots[b].rotation.z = beamAngle(b, t);
        parts.beams[b].material.uniforms.uLevel.value = intensity * 0.72 * fade;
      }

      // ① 萨克斯 + ② 按键流光 + ⑤ 反光带。
      const keys = parts.body.material.uniforms.uKeyLight.value as number[];
      for (let i = 0; i < SAX_KEY_COUNT; i += 1) {
        keys[i] = keyLight(i, t);
      }
      parts.body.material.uniforms.uSheenSeat.value = 0.5
        + beamAngle(0, t) * 0.42 * ctx.height * 0.12;

      // ④ 管口热雾：读呼吸强度（互动②的同源量）。
      mist.advance(t, delta, breathMist(t));
      parts.mist.material.uniforms.uLevel.value = breathMist(t) * fade;
      parts.mist.material.uniforms.uTime.value = t * 4.2;

      // ③ 音符摇曳：竖向严格单调上升 + 水平反复过零。
      for (let n = 0; n < parts.notes.length; n += 1) {
        const mesh = parts.notes[n];
        const p = noteProgress(n, t);
        const rise = noteRise(n, t);
        const sway = noteSway(n, t);
        mesh.position.set(
          // 上升跟着旋律强弱轻微向右漂（气流带着走），摇摆叠在其上。
          parts.bellX + p * parts.width * 0.18 + sway * swayAmpX,
          parts.bellY + rise * (bandTop - parts.bellY),
          mesh.position.z,
        );
        mesh.material.uniforms.uAlpha.value = noteFade(n, t) * fade;
        // 音符随摆动倾斜：摆到一侧时歪向那侧。
        mesh.material.uniforms.uTilt.value = sway * 0.6;
      }
    },

    dispose(): void {
      mist.dispose();
      parts.res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'saxophone',
    title: '爵士萨克斯',
    elements: ['萨克斯 mesh', '按键流光', '音符摇曳', '管口热雾', '铜管反光带', '节奏鼓点光', '舞台暗幕', '摇摆光束'],
    signature: '唯一"慵懒摇曳"节奏（与 piano 的跳跃、trumpet 的定向号口均不同）',
    preset: 'note-dance',
  },
  createSaxophoneStage,
);
