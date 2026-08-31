/**
 * 场景 36 boxing-glove（boxing · 重拳，850ms）。
 *
 * 三幕（规格 §4.2 场景 36，全库第二快）：
 * - 0–200ms   出拳（恒力加速，残影拖出拳路）
 * - 200–600ms 命中 + 压缩环 + 震屏（过冲越过命中面再被肌腱拉回）
 * - 600–850ms 回拳收势
 *
 * 独立签名：**唯一「命中空气」**——全库其余冲击场景（axe 破木、
 * shield 格挡、spear 穿刺）都有实体承接动量，所以命中即停；本场景
 * 没有被击物，拳**必须越过命中面**（`PUNCH_OVERSHOOT > 1`），再由自身
 * 肌腱把它拉回来。可验收内涵：命中瞬间速度严格非零，且过冲深度与
 * 达峰时刻都由拳速连同肌腱阻力**反解**得出，不是另拍的常数。
 *
 * 互动：①**压缩环被拳推开**——环心恒等于拳套此刻的行程位置，且环的
 * 初始冲量读命中那一刻的拳速，所以「拳压出环」是同一个量的两次使用；
 * ②**汗滴被环波溅开**——汗滴发射率与环冲量同源（都是 `gloveSpeed` 的
 * 归一化），环强则汗多。
 *
 * 签名数学在 ./punch-impact，冲击后效在 ./punch-recoil，
 * 元素搭建在 ./punch-parts，汗滴在 ./punch-sweat。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildPunchParts } from './punch-parts';
import { createSweatLayer } from './punch-sweat';
import {
  PUNCH_ACT1_END, PUNCH_ACT2_END, RING_COUNT,
  gloveReach, hitFlash, ringAlpha, ringCenter, ringRadius,
} from './punch-impact';
import {
  GHOST_COUNT, bagSway, ghostAlpha, ghostReach, gloveSquash, screenShake,
} from './punch-recoil';

export { PUNCH_ACT1_END, PUNCH_ACT2_END };

function createBoxingGloveStage(ctx: CgStageContext): CgStage {
  const parts = buildPunchParts(ctx);
  const sweat = createSweatLayer(parts.shakeRig, ctx, parts.short);
  const { res, startX, impactX, gloveR } = parts;
  // 拳路跨度：起手位到命中面的像素距离。归一化行程乘它即屏幕位移，
  // 所以「行程 1 = 命中面」在画面上真的落在命中面。
  const span = impactX - startX;
  let last = 0;

  return {
    update(t, elapsedMs): void {
      if (res.disposed) return;
      const delta = frameDelta(elapsedMs, last);
      last = elapsedMs;

      const [, , act3] = acts(t, PUNCH_ACT1_END, PUNCH_ACT2_END);
      const travel = gloveReach(t);
      const gloveX = startX + travel * span;
      const squash = gloveSquash(t);
      const flash = hitFlash(t);

      // ⑤ 震屏：整场画面位移，命中后才起（拳打空气也会震到镜头）。
      parts.shakeRig.position.x = screenShake(t) * parts.short * 0.026;
      parts.shakeRig.position.y = screenShake(t) * parts.short * -0.014;

      // ① 拳套：位置读行程，⑥ 变形读压扁量（沿拳路压实）。
      parts.glove.position.x = gloveX;
      parts.glove.material.uniforms.uSquash.value = squash;
      // 形变也落到 transform 上：光靠 shader 里的 uSquash 只让纹理变形，
      // 拳套轮廓本身不动，命中帧看不出「被压实」。横向按 1/√squash 鼓起，
      // 让面积守恒——软质拳套受压是变形而非缩小。
      parts.glove.scale.set(squash, 1 / Math.sqrt(squash), 1);
      parts.glove.material.uniforms.uFlash.value = flash * 0.8;

      // ④ 拳路残影：各层落在拳套走过的位置上（同一条 gloveReach 的
      // 延迟采样），不透明度读该层当时的速率——慢下来残影自然就没了。
      for (let i = 0; i < GHOST_COUNT; i += 1) {
        const mesh = parts.ghosts[i];
        mesh.position.x = startX + ghostReach(i, t) * span;
        mesh.material.uniforms.uAlpha.value = ghostAlpha(i, t);
        mesh.material.uniforms.uSquash.value = 1;
      }

      // ② 压缩环：环心恒等于拳此刻的行程位置（互动①），半径与亮度
      // 是两条曲线——环一边扩大一边变淡。
      for (let i = 0; i < RING_COUNT; i += 1) {
        const mesh = parts.rings[i];
        mesh.position.x = startX + ringCenter(i, t) * span;
        mesh.material.uniforms.uRadius.value = ringRadius(i, t);
        mesh.material.uniforms.uAlpha.value = ringAlpha(i, t);
      }

      // ③ 命中白闪：钉在命中面（闪的是被压实的空气，不是拳套）。
      parts.flash.position.x = impactX;
      parts.flash.material.uniforms.uLevel.value = flash;

      // ⑦ 汗滴：从拳面甩出，发射点跟着拳走（互动②）。
      // 拳面在拳套的 +x 侧，压扁时拳面被压回来一点。
      sweat.advance(t, delta, new THREE.Vector3(gloveX + gloveR * squash * 0.8, 0, 0));

      // ⑧ 沙袋虚影：命中后才被气浪推得摆起来，收势期继续余摆。
      parts.bagPivot.rotation.z = bagSway(t);
      parts.bag.material.uniforms.uAlpha.value = 0.5 * (1 - act3 * 0.3);
    },

    dispose(): void {
      sweat.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'boxing-glove',
    title: '重拳',
    elements: ['拳套 mesh', '压缩环', '命中间闪光', '拳路残影', '震屏', '拳套变形', '汗滴飞溅', '沙袋虚影'],
    signature: '唯一"命中空气"（无实体目标）；850ms 快节奏全库第二快',
    preset: 'boxing',
  },
  createBoxingGloveStage,
);
