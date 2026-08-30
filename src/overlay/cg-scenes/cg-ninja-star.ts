/**
 * 场景 05 ninja-star（orbit · 回旋手里剑，1200ms）。
 *
 * 三幕（规格 §4.2 场景 05）：
 * - 0–300ms     掷出 + 自旋加速
 * - 300–900ms   回旋切点 ×2 + 火星
 * - 900–1200ms  急停回收 + 月轮显影
 *
 * 互动：①**光带与残影在切点汇合**——`orbitCuspSweeps()` 是唯一真值，光带
 * 的加亮结与残影的挤压都读它，改捏拢强度两者一起移动；②**火星从切点崩出**
 * ——每颗火星的 `bornAt` 取自 `orbitCuspTimes()`，崩出前刚体冻结，所以
 * 落地时刻必晚于切点；③**剑影掠过月轮时压暗**——遮挡量由手里剑与月盘的
 * 实际间距算出，剑不经过月前就没有变暗。
 *
 * 两条独立签名：
 * - **唯一的回旋镖式曲线**：飞出去又回到起点附近（末端距起点只剩最远处的
 *   5%），且不是共线往返——去回两支分居环的两侧，切向在整幕内单向转过约
 *   一整圈。与 spear（同为投掷、直飞不返回）、bow（箭直飞）划清界限。
 * - **5 层 ghost 残影，全库唯一**：第 k 层 ≡ 本体在 t−k·lag 的闭式重算，
 *   不是 5 个独立飞行物，也不随档位缩减。
 *
 * 回旋数学在 ./shuriken-orbit，残影环在 ./shuriken-ghosts，
 * 火星刚体在 ./ninja-star-sparks，元素搭建在 ./ninja-star-parts，
 * 本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildNinjaStarParts } from './ninja-star-parts';
import { createSparkField } from './ninja-star-sparks';
import {
  NINJA_ACT1_END,
  NINJA_ACT2_END,
  orbitAt,
  orbitCuspSweeps,
  orbitTangent,
  rateShape,
  spinAngle,
  sweepAt,
} from './shuriken-orbit';

export { NINJA_ACT1_END, NINJA_ACT2_END };

function createNinjaStarStage(ctx: CgStageContext): CgStage {
  const parts = buildNinjaStarParts(ctx);
  const { res, body, ghosts, trail, moon, rims, whistle } = parts;
  const { orbitScale, center, bodySize, short } = parts;

  // ⑥ 落地火星：刚体层（崩出时刻绑在切点上）。
  const sparks = createSparkField(res, ctx, orbitScale, center, parts.groundY);

  // 刃口火花：quarks 表达「钢刃刮开空气的碎屑」，与可寻址火星互补——
  // 前者是氛围（跟着剑走），后者是可数的落地弹跳。
  const hub = createParticleHub(res.group, ctx.quality);
  const grindPos = new THREE.Vector3(center.x, center.y, 8);
  const grind = hub.emit({
    count: 72,
    lifetime: [0.14, 0.4],
    speed: [short * 0.08, short * 0.3],
    size: [short * 0.004, short * 0.011],
    color: new THREE.Color('#FFE6B0'),
    shape: 'cone',
    spread: Math.PI * 0.5,
    position: grindPos,
    looping: true,
    rate: 0,
  });

  let lastNow = ctx.now;
  const [cusp0, cusp1] = orbitCuspSweeps();
  // 月盘中心与半径（遮挡判定用，与 parts 里的建模保持同一来源）。
  const moonCenter = new THREE.Vector2(moon.position.x, moon.position.y);
  const moonRadius = short * 0.9 * 0.34;

  return {
    update(t: number, now: number): void {
      if (res.disposed) return;
      const [act1, act2, act3] = acts(t, NINJA_ACT1_END, NINJA_ACT2_END);
      hub.update(frameDelta(now, lastNow));
      lastNow = now;
      const seconds = now / 1000;

      // 全幕包络：开幕淡入，末端跟着急停一起收。
      const envelope = Math.min(1, act1 * 2.4) * (1 - act3 * act3 * 0.35);
      // 归一化速度（回旋与自旋的共同因）。
      const speed = rateShape(t);
      const sweep = sweepAt(t);

      // ① 手里剑本体：位置走签名曲线，姿态由切向 + 自旋叠出。
      const p = orbitAt(t);
      const px = center.x + p.x * orbitScale.x;
      const py = center.y + p.y * orbitScale.y;
      body.position.set(px, py, 12);
      // 姿态 = 航向（切向）+ 自旋。切向取闭式导数而非帧差分：稀疏调用下
      // 差分会失真，而航向必须在整幕内单向转过一整圈（回旋的判据之一）。
      const tangent = orbitTangent(sweep);
      const heading = Math.atan2(tangent.y * orbitScale.y, tangent.x * orbitScale.x);
      body.rotation.z = spinAngle(t) + heading;
      // 急停时略微回缩（被接住的收势）。
      body.scale.setScalar(bodySize * (1 - act3 * 0.18));
      body.material.uniforms.uAlpha.value = envelope;
      // ③ 金属反光扫掠：高光带沿刃面横扫，扫掠速率与自旋同源。
      body.material.uniforms.uSweep.value = Math.sin(spinAngle(t) * 2) * 0.8;
      // 高速自旋时刃缘被运动模糊抹圆，急停后重新变锐。
      body.material.uniforms.uSharp.value = 0.62 - speed * 0.42;

      // ② 残影环：5 层，位置全部来自本体轨迹的历史时刻闭式重算。
      ghosts.drive(t, orbitScale, center, envelope, bodySize);

      // ④ 回旋轨迹光带：只画已飞过的那段；切点处加亮 = 与残影汇合（互动①）。
      trail.material.uniforms.uHead.value = sweep;
      trail.material.uniforms.uCusp0.value = cusp0;
      trail.material.uniforms.uCusp1.value = cusp1;
      trail.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6) * (1 - act3 * 0.5);
      // 汇合强度只在切点附近抬起来：离切点远时结不该发光。
      const nearCusp = Math.max(
        Math.exp(-(((sweep - cusp0) / 0.06) ** 2)),
        Math.exp(-(((sweep - cusp1) / 0.06) ** 2)),
      );
      trail.material.uniforms.uGlow.value = nearCusp * (0.35 + speed * 0.65);

      // ⑧ 风切声纹：跟着头部，慢下来就安静。
      whistle.material.uniforms.uHead.value = sweep;
      whistle.material.uniforms.uSpeed.value = speed;
      whistle.material.uniforms.uPhase.value = seconds * 5.4;
      whistle.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.5) * speed;

      // ⑤ 月轮：第三幕显影（急停后画面静下来，月才读得到）。
      moon.material.uniforms.uAlpha.value = 0.2 + act1 * 0.25 + act3 * 0.62;
      // 互动③ 剑影掠过月轮：遮挡量由**实际间距**给，剑不过月前就不变暗。
      const gap = Math.hypot(px - moonCenter.x, py - moonCenter.y);
      moon.material.uniforms.uEclipse.value =
        Math.max(0, 1 - gap / (moonRadius + bodySize * 1.6)) * envelope;

      // ⑦ 屏边冲击纹：切点处外扩一圈（拐弯的冲击波打到屏缘）。
      for (let i = 0; i < rims.length; i += 1) {
        const rim = rims[i];
        const delay = i * 0.14;
        const local = Math.max(0, nearCusp - delay) / Math.max(0.001, 1 - delay);
        rim.material.opacity = local > 0 ? local * 0.5 * act1 : 0;
        rim.scale.setScalar(1 + local * (0.1 + i * 0.06));
      }

      // ⑥ 落地火星：从切点崩出后按刚体弹跳。
      sparks.advance(t);
      sparks.setOpacity(Math.min(0.9, act2 * 1.4) * (1 - act3 * 0.3));

      // 刃口火花：发射点跟着剑走，发射率吃速度（急停即止）。
      grindPos.set(px, py, 8);
      if (grind) {
        grind.emitter.position.copy(grindPos);
        grind.emissionOverTime = new ConstantValue(speed > 0.02 ? 30 + speed * 150 : 0);
      }
    },

    dispose(): void {
      if (res.disposed) return;
      sparks.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'ninja-star',
    title: '回旋手里剑',
    elements: ['手里剑本体', '残影环', '金属反光扫掠', '回旋轨迹光带', '月轮', '落地火星', '屏边冲击纹', '风切声纹'],
    signature: '唯一"回旋镖式"运动曲线；ghost 残影 5 层全库唯一',
    preset: 'orbit',
  },
  createNinjaStarStage,
);

export { createNinjaStarStage };
