/**
 * 场景 42 black-hole（singularity · 吞噬黑洞，1850ms）。
 *
 * 三幕（规格 §4.2 场景 42）：
 * - 0–450ms   视界稳定、吸积盘成形
 * - 450–1450ms 吞噬加速、喷流点火、透镜最强
 * - 1450–1850ms 白炽熄灭
 *
 * 互动：①尘埃被拽入 → 盘温度升高 → 喷流增亮；②透镜强度随尘埃密度；
 * ③背景星被同一引力量弯曲。三者共用一个进度源，因此耦合是真的而非各演各的。
 *
 * 独立签名：**物质回弹**——一部分吸积物质被喷流沿极轴弹回。
 * 全库只有这个场景的粒子会反向出去，其余都是单向发散或单向汇聚。
 *
 * 元素搭建在 ./black-hole-parts，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { accretionColor, buildBlackHoleParts } from './black-hole-parts';

/** 三幕边界（归一化，对应 1850ms）。 */
const ACT1_END = 450 / 1850;
const ACT2_END = 1450 / 1850;

/** 临界线颜色：尘埃越线瞬间的紫闪。 */
const CRITICAL_TINT = new THREE.Color('#C88CFF');

function createBlackHoleStage(ctx: CgStageContext): CgStage {
  const parts = buildBlackHoleParts(ctx);
  const { res, diskRadius, horizonRadius } = parts;
  const criticalRadius = horizonRadius * 1.9;

  // 粒子层：盘面高温流 + 喷流火花，档位与释放由工具层统一管。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 90,
    lifetime: [0.5, 1.2],
    speed: [diskRadius * 0.12, diskRadius * 0.34],
    size: [2.5, 6.5],
    color: accretionColor(0.2, ctx.color),
    shape: 'sphere',
    spread: diskRadius * 0.85,
  });
  hub.emit({
    count: 46,
    lifetime: [0.35, 0.9],
    speed: [diskRadius * 0.5, diskRadius * 1.15],
    size: [2, 5],
    color: new THREE.Color('#D9C4FF'),
    shape: 'cone',
    spread: 0.16,
  });

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, ACT1_END, ACT2_END);

      // ① 视界：第一幕撑开，末幕被白炽吞掉。
      parts.horizon.scale.setScalar(0.35 + act1 * 0.65);
      parts.horizon.material.opacity = 1 - act3 * 0.85;
      parts.photonRing.uniforms.uProgress.value = act2;
      parts.photonRing.uniforms.uIntensity.value = act1 * (1 - act3 * 0.7) * (0.85 + act2 * 0.5);

      // ② 盘：成形 → 稳转 → 被拽入视界。
      parts.disk.scale.setScalar((0.18 + act1 * 0.82) * (1 - act3 * 0.55));
      for (let i = 0; i < parts.bands.length; i += 1) {
        const band = parts.bands[i];
        band.mesh.rotation.z = seconds * band.spin * 0.55;
        band.material.opacity = act1 * (0.85 - i * 0.055) * (1 - act3 * 0.8);
      }

      // ④⑥ 透镜与星场共用一个引力量：互动是真耦合，不是两条独立曲线。
      const lensStrength = act2 * (1 - act3) * 1.15;
      parts.lens.uniforms.uTime.value = seconds;
      parts.lens.uniforms.uStrength.value = lensStrength;
      parts.starField.uniforms.uTime.value = seconds;
      parts.starField.uniforms.uLensing.value = 0.35 + lensStrength;

      // ⑤ 喷流：第二幕点火，长度随吞噬推进增长。
      const ignition = Math.min(1, act2 * 1.4);
      const jetLength = Math.max(0.001, ignition * (1 - act3 * 0.6));
      for (const jet of parts.jets) {
        jet.core.scale.set(0.6 + ignition * 0.4, jetLength, 0.6 + ignition * 0.4);
        jet.sheath.scale.set(0.7 + ignition * 0.5, jetLength * 1.05, 0.7 + ignition * 0.5);
        (jet.core.material as THREE.MeshBasicMaterial).opacity = ignition * 0.75 * (1 - act3 * 0.5);
        (jet.sheath.material as THREE.MeshBasicMaterial).opacity = ignition * 0.28 * (1 - act3 * 0.5);
      }

      // ③ 尘埃：向心加速，部分被喷流弹回（独立签名）。
      let crossings = 0;
      for (const d of parts.dust) {
        // 越靠近视界收得越快：指数让末段明显加速，像真被引力拽。
        const fall = Math.pow(act1 * 0.35 + act2 * 0.65, 1.35);
        let radius = d.radius * (1 - fall * 0.92);
        const angle = d.angle + seconds * d.spin * (1.1 + (1 - radius / d.radius) * 2.4);
        let x = Math.cos(angle) * radius;
        let y = Math.sin(angle) * radius * 0.34;

        if (d.rebound && radius < criticalRadius * 1.25) {
          const kick = Math.max(0, act2 - 0.25) / 0.75;
          y += d.reboundSign * kick * diskRadius * 1.15;
          x *= 1 - kick * 0.72;
          radius = Math.hypot(x, y);
        }

        d.mesh.position.set(x, y, 0);
        d.mesh.rotation.set(angle, angle * 0.7, seconds * 1.6);

        const material = d.mesh.material as THREE.MeshBasicMaterial;
        const alive = radius > horizonRadius * 0.85 ? 1 : 0;
        material.opacity = alive * act1 * 0.9 * (1 - act3 * 0.9);
        if (alive && Math.abs(radius - criticalRadius) < criticalRadius * 0.14) {
          material.color.lerp(CRITICAL_TINT, 0.35);
          crossings += 1;
        }
      }

      // ⑧ 临界闪现：亮度随当帧越线尘埃数脉动。
      const crossRatio = crossings / Math.max(6, parts.dust.length * 0.22);
      parts.criticalFlash.material.opacity = Math.min(0.85, crossRatio) * act2 * (1 - act3);
      parts.criticalFlash.rotation.z = seconds * 0.8;

      // ⑨ 白炽：只在第三幕爆闪。
      parts.finalFlare.material.opacity = Math.pow(act3, 1.6) * 0.95;
      parts.finalFlare.scale.setScalar(0.4 + act3 * 5.2);
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
    packId: 'black-hole',
    title: '吞噬黑洞',
    elements: [
      '事件视界', '吸积盘', '被吞噬尘埃', '引力透镜', '双极相对论喷流',
      '背景星场', '吸积温度渐变', '临界闪现', '尾声白炽',
    ],
    signature: '唯一"引力主场"（全屏被弯曲）；吞噬+喷流回弹循环（唯一有"物质回弹"的吸积机制）',
    preset: 'singularity',
  },
  createBlackHoleStage,
);

export { createBlackHoleStage };
