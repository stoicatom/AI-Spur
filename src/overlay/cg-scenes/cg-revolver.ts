/**
 * 场景 34 revolver（gunshot · 左轮射击，720ms）。
 *
 * 三幕（规格 §4.2 场景 34，本场景时长最短）：
 * - 0–180ms   击发 + 枪口焰
 * - 180–500ms 弹壳抛飞 + 后坐 + 硝烟
 * - 500–720ms 弹壳落地弹跳 + 烟散
 *
 * 互动：①**枪口焰消退时硝烟才起**——这是接力而非并发：硝烟浓度读的是
 * 焰的**已燃尽份额**（积分）过阈值后的一阶响应，所以焰峰时刻硝烟严格为
 * 零，两者峰值隔着整整两幕；②**弹壳落地弹跳**——由 cannon 的解析接触
 * 按弹性翻转竖向速度给出，单步升幅可数。
 *
 * 独立签名：**唯一「短促击发」**。720ms 是全库最短，而「短促」做实在焰的
 * 包络上——峰值落在 t=0.028（全库其余场景的起势段都在 0.2 以上，本场景
 * 是它们的十分之一），峰后 38ms 掉到 1/e。第二条签名是**弹壳的刚体
 * 抛物线**：全库唯一「一次抛射后纯重力自由飞行」的刚体层。
 *
 * 元素搭建在 ./revolver-parts，弹壳物理在 ./revolver-casing，
 * 签名数学在 ./revolver-discharge。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildRevolverParts } from './revolver-parts';
import { createCasingField } from './revolver-casing';
import {
  REVOLVER_ACT1_END,
  REVOLVER_ACT2_END,
  cameraShake,
  coneReach,
  cylinderTurn,
  muzzleFlash,
  recoilKick,
  smokeDensity,
  smokeOnsetT,
  targetBurst,
  tracerFlash,
} from './revolver-discharge';

export { REVOLVER_ACT1_END, REVOLVER_ACT2_END };

/** 抛壳时刻：第二幕起（规格「180–500ms 弹壳」）。 */
const CASING_START_AT = REVOLVER_ACT1_END;

function createRevolverStage(ctx: CgStageContext): CgStage {
  const parts = buildRevolverParts(ctx);
  const { res, body, cone, recoilRig, tracer, puffs, sparks, targetFlash } = parts;
  const { muzzle, aim, short, groundY } = parts;

  // ② 枪口焰的粒子层：锥光给「铺满一侧」，火舌给颗粒感，几何件表达不了。
  const hub = createParticleHub(res.group, ctx.quality);
  const flamePos = muzzle.clone();
  hub.emit({
    count: 90,
    lifetime: [0.05, 0.14],
    speed: [short * 1.2, short * 3.4],
    size: [3, 11],
    color: new THREE.Color('#FFD9A0'),
    shape: 'cone',
    spread: 0.34,
    position: flamePos,
  });
  // ⑥ 硝烟的粒子层：慢速、长寿命，与烟团 shader 叠出体积。
  const smokeJet = hub.emit({
    count: 54,
    lifetime: [0.28, 0.5],
    speed: [short * 0.16, short * 0.5],
    size: [10, 26],
    color: new THREE.Color('#A8A29A'),
    shape: 'cone',
    spread: 0.62,
    position: flamePos,
    looping: true,
    rate: 0,
  });

  // 焰锚点：quarks 的 emitter 会被 BatchedRenderer 从场景树摘走，
  // 要断言发射位置就得自持一个镜像节点。
  const flameAnchor = new THREE.Object3D();
  flameAnchor.name = 'flame-anchor';
  flameAnchor.position.copy(flamePos);
  res.group.add(flameAnchor);

  // ③ 弹壳刚体层。
  const casings = createCasingField(res, ctx, muzzle, groundY, aim, CASING_START_AT);

  const onset = smokeOnsetT();
  const baseRig = recoilRig.position.clone();
  let lastNow = ctx.now;

  return {
    update(t, now, _quality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [, act2, act3] = acts(t, REVOLVER_ACT1_END, REVOLVER_ACT2_END);
      const flash = muzzleFlash(t);
      const smoke = smokeDensity(t);
      const kick = recoilKick(t);

      // ① 枪身：整幕可见，被自己的枪口焰照亮一瞬。
      body.material.uniforms.uAlpha.value = Math.min(1, 0.35 + t * 4) * (1 - act3 * 0.25);
      body.material.uniforms.uFlash.value = flash;
      // ⑦ 转轮偏转：一发一格，第一幕内转到位并锁住。
      body.material.uniforms.uCylinder.value = cylinderTurn(t);

      // ② 焰口锥光：向一侧铺开，长度与亮度同源于焰强度。
      cone.material.uniforms.uTime.value = seconds;
      cone.material.uniforms.uReach.value = coneReach(t);
      cone.material.uniforms.uAlpha.value = flash * 0.85;

      // ④ 后坐力：枪身沿射击反向退，叠上同源的高频微震。
      // 「枪往后 + 镜头在抖」是一次冲量的两个表现，共用 recoilKick。
      const shake = cameraShake(t);
      recoilRig.position.set(
        baseRig.x - aim * kick * short * 0.055 + shake * short * 0.008,
        baseRig.y + shake * short * 0.006,
        baseRig.z,
      );
      recoilRig.rotation.z = -aim * kick * 0.13;

      // ⑤ 弹道火光：比焰更早熄的一条亮线。
      const tracerLevel = tracerFlash(t);
      tracer.material.opacity = tracerLevel * 0.9;
      tracer.scale.y = 0.4 + tracerLevel * 1.6;

      // ⑧ 目标炸点：隔着子弹飞行时间，必然晚于枪口起亮。
      const burst = targetBurst(t);
      targetFlash.material.opacity = burst;
      targetFlash.scale.setScalar(0.5 + burst * 1.3);

      // ⑦ 转轮侧向光斑：随转角绕行，亮度跟着焰（弹巢缝里透出的火光）。
      const turn = cylinderTurn(t);
      const sparkR = short * 0.036;
      for (const { mesh, angle } of sparks) {
        const a = angle + turn;
        mesh.position.set(Math.cos(a) * sparkR, Math.sin(a) * sparkR, 5);
        // 只有朝向枪口那半边被照亮：侧向光斑不是一圈均匀的环。
        const facing = Math.max(0, Math.cos(a) * aim);
        mesh.material.opacity = flash * facing * 0.8;
        mesh.scale.setScalar(0.6 + flash * facing * 0.9);
      }

      // ⑥ 硝烟：起烟时刻由焰的燃尽份额反解，因此必然在焰之后。
      for (const { mesh, drift, phase } of puffs) {
        // 各团错相位涌出，但整体强弱由同一个 smokeDensity 门控。
        const local = Math.min(1, Math.max(0, (t - onset) / 0.16 - phase * 0.12));
        const level = smoke * local;
        mesh.material.uniforms.uTime.value = seconds;
        mesh.material.uniforms.uSwell.value = level;
        mesh.material.uniforms.uAlpha.value = level * 0.5;
        // 漂移量按闭式给（不逐帧累加）：烟随燃气往枪口前上方走。
        const travel = Math.max(0, t - onset) * short * 0.55;
        mesh.position.set(
          muzzle.x + drift.x * travel,
          muzzle.y + drift.y * travel,
          6,
        );
        mesh.scale.setScalar(0.55 + level * 1.1);
      }
      // 粒子烟的发射率跟着同一条曲线：一处涌出，两层响应。
      if (smokeJet) {
        smokeJet.emitter.position.copy(flamePos);
        smokeJet.emissionOverTime = new ConstantValue(smoke * 150);
      }

      // ③ 弹壳：第二幕抛出，第三幕落地弹跳。
      casings.advance(t);
      casings.setOpacity(Math.min(1, act2 * 3));
    },

    dispose(): void {
      if (res.disposed) return;
      casings.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'revolver',
    title: '左轮射击',
    elements: ['枪身 mesh', '枪口焰', '弹壳抛飞', '后坐力', '弹道火光', '硝烟', '转轮偏转', '目标炸点'],
    signature: '唯一"短促击发"（720ms 最快素材）；弹壳刚体抛物线全库唯一',
    preset: 'gunshot',
  },
  createRevolverStage,
);

export { createRevolverStage };
