/**
 * 场景 40 vinyl（groove · 黑胶，1900ms）。
 *
 * 三幕（规格 §4.2 场景 40，本场景时长并列最长）：
 * - 0–380ms    唱盘起速 + 落针
 * - 380–1560ms 播放：唱针沿槽内移、音轨光流跟随
 * - 1560–1900ms 惰行减速 + 光流退去
 *
 * 互动：①**光流锚在针尖**——音轨光流的高亮半径恒等于唱针半径，
 * 「正在被读取的那一段槽在发亮」因此是同一个量的两次使用，不是两处
 * 各自调曲线；②**音尘由针犁起**——尘的发射点跟着针尖走，强度在落针
 * 那一下最强（`dustBurst` 指数退），所以尘团位置随播放向盘心迁移。
 *
 * 独立签名：**唯一「旋转载体 + 纹路光流」**。与五个已完成音乐场景
 * （guitar 弦振、drum 击打、bell 驻波、trumpet 号口、harp 拨弦）的分野
 * 在发声原理——那些是振动体自己发声，本场景是载体被读取。可验收的
 * 内涵是**唱针半径单向内移**（`stylusRadius` 严格单减）：黑胶从外圈往
 * 内圈播放，方向不可逆；一支来回摆动的唱针读不出连续音轨。
 *
 * 元素搭建在 ./vinyl-parts，音尘在 ./vinyl-dust，签名数学在 ./vinyl-groove。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, createSceneResources, frameDelta } from '../cg-scene-kit';
import { buildVinylParts } from './vinyl-parts';
import { createDustLayer } from './vinyl-dust';
import {
  VINYL_ACT1_END,
  VINYL_ACT2_END,
  discAngle,
  discOmega,
  stylusArmAngle,
  stylusRadius,
  trackGlow,
} from './vinyl-groove';

export { VINYL_ACT1_END, VINYL_ACT2_END };

function createVinylStage(ctx: CgStageContext): CgStage {
  const res = createSceneResources(ctx.root, ctx.origin, 'cg-vinyl');
  const short = Math.min(ctx.width, ctx.height);
  const parts = buildVinylParts(
    res,
    { width: ctx.width, height: ctx.height, short },
    {
      sheen: new THREE.Color('#8FB6FF'),
      track: new THREE.Color('#FFD24A'),
      lamp: new THREE.Color('#4A7BFF'),
    },
  );
  const dust = createDustLayer(res, ctx, short);

  const armLen = parts.discR * 1.24;
  let last = 0;

  return {
    update(t, elapsedMs): void {
      if (res.disposed) return;
      const delta = frameDelta(elapsedMs, last);
      last = elapsedMs;

      const [, , act3] = acts(t, VINYL_ACT1_END, VINYL_ACT2_END);
      const angle = discAngle(t);
      const omega = discOmega(t);
      const radius = stylusRadius(t);
      const glow = trackGlow(t);

      // ①+② 唱片与盘面纹路：盘体随转角旋，槽在片元里跟着转。
      parts.disc.rotation.z = angle;
      parts.disc.material.uniforms.uTime.value = t * 6.2;
      parts.disc.material.uniforms.uAngle.value = angle;

      // ⑤ 转速视觉：强度读角速度，快时糊、停时清。
      parts.spin.rotation.z = angle;
      parts.spin.material.uniforms.uOmega.value = omega;
      parts.spin.material.uniforms.uAngle.value = angle;

      // ④ 音轨光流：高亮半径恒等于唱针半径（互动①）。
      parts.track.material.uniforms.uRadius.value = radius;
      parts.track.material.uniforms.uGlow.value = glow;
      parts.track.material.uniforms.uAngle.value = angle;

      // ③ 唱针：唱臂摆角与半径同源，针尖因此落在正确的槽上。
      parts.armPivot.rotation.z = stylusArmAngle(t);

      // 针尖局部位置：臂绕支点转过 armAngle 后末端所在处。臂沿 -x 伸出，
      // 所以末端方向是旋转后的 -(cos a, sin a)。这与 stylusArmAngle 的
      // 余弦定理反解互为逆运算——它保证 |tip| 恰等于 stylusRadius。
      const a = parts.armPivot.rotation.z;
      const tip = new THREE.Vector3(
        parts.armPivot.position.x - Math.cos(a) * armLen,
        parts.armPivot.position.y - Math.sin(a) * armLen,
        0,
      );

      // ⑥ 音尘：发射点跟着针尖（互动②）。
      dust.advance(t, delta, tip);

      // ⑦ 灯语：整场都在，第三幕随音乐收尾略暗。
      parts.lamp.material.uniforms.uTime.value = t * 5.4;
      parts.lamp.material.uniforms.uIntensity.value = 0.42 * (1 - act3 * 0.45);

      // ⑧ 旋转影：随盘同步转，不透明度随转速微升（转起来投影更实）。
      for (let i = 0; i < parts.shadows.length; i += 1) {
        const mesh = parts.shadows[i];
        mesh.rotation.z = angle;
        const base = 0.3 / (i + 1);
        mesh.material.opacity = base * (0.72 + 0.28 * Math.min(1, omega / 11.6));
      }
    },

    dispose(): void {
      dust.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'vinyl',
    title: '黑胶',
    elements: ['唱片 mesh', '盘面纹路', '唱针', '音轨光流', '转速视觉', '音尘', '灯语', '旋转影'],
    signature: '唯一"旋转载体+纹路光流"；1900ms 时长并列最长',
    preset: 'groove',
  },
  createVinylStage,
);
