/**
 * 场景 12 water（water-splash · 深泉水跃，1200ms）。
 *
 * 三幕（规格 §4.2 场景 12）：
 * - 0–250ms    涌起：水柱自水面长高，底光聚能
 * - 250–850ms  崩散 + 水珠 + 涟：柱体失稳分缕，水珠抛出并落水激起波前
 * - 850–1200ms 水面静复 + 雾散
 *
 * 互动：①**水珠落地激起涟漪**——每圈涟漪绑定一颗具体水珠，启动时刻取自
 * 那颗水珠弹道方程的触底解、圆心取自它的触底横坐标；改重力或出膛速度，
 * 涟漪的起点与位置会一起变（不是定时器）。②**水雾在水柱峰顶散开**——
 * 雾层中心逐帧跟随当帧柱顶高度，柱涨雾升、柱崩雾散。
 *
 * 独立签名：**流体柱崩散**——一根连续柱体先涌起（scale.y 单调增）
 * 再自顶端分缕解体（uBreak 撕出丝状缕并把水量转成水珠）。
 * 与 downpour 的「雨帘」形成材质对照：那边是无数条从天而降的独立细线，
 * 这边是从水面长出来的一根整体，方向与拓扑都相反。
 *
 * 元素搭建在 ./water-parts 与 ./water-droplets，纯数学在 ./water-motion，
 * 本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { Body } from 'cannon-es';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { frameDelta } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { buildWaterParts } from './water-parts';
import { driveDroplets, driveFoam } from './water-droplets';
import {
  WATER_ACT1_END, WATER_ACT2_END, columnBreak, columnRise,
  progressToTau, rippleRadius, waterActs, WATER_RIPPLE_LIFE_S,
} from './water-motion';

export { WATER_ACT1_END, WATER_ACT2_END };

/** 物理固定步长，与 bomb/ice 一致，保证确定性重放（R-PERF-001）。 */
const PHYSICS_STEP = 1 / 60;
/** 单帧最多补齐的步数：防止极端跳帧时一次 update 里跑满整幕物理。 */
const MAX_PHYSICS_CATCHUP = 240;

function createWaterStage(ctx: CgStageContext): CgStage {
  const parts = buildWaterParts(ctx);
  const { res, drops, surfaceY, gravity, columnHeight } = parts;
  const { width, height } = ctx;
  const short = Math.min(width, height);

  // 涟漪绑定：按触底时刻最早的前 N 颗水珠取，三圈涟漪因此对应
  // 「最先落水的那几滴」——观感上也正是这样，第一滴落水先开圈。
  const ordered = drops.droplets
    .map((drop, index) => ({ index, at: drop.impactTau }))
    .filter((row) => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);
  for (let i = 0; i < parts.ripples.length; i += 1) {
    // 拉开取样间距：三圈全绑最早三滴会几乎同时开，看不出「一滴一圈」。
    const pick = ordered[Math.min(ordered.length - 1, i * Math.max(1, Math.floor(ordered.length / 4)))];
    parts.ripples[i].sourceIndex = pick ? pick.index : -1;
  }

  // 粒子层（规格元素②的细密水沫尾）：Points/mesh 表达可寻址的水珠，
  // 而柱顶持续喷出的雾状细沫是「一团」，交给 quarks 更合适。
  const hub = createParticleHub(res.group, ctx.quality);
  hub.emit({
    count: 110,
    lifetime: [0.25, 0.7],
    speed: [short * 0.3, short * 0.95],
    size: [1.6, 4.4],
    color: new THREE.Color('#DFF7FF'),
    shape: 'sphere',
    spread: short * 0.04,
    position: new THREE.Vector3(0, surfaceY + columnHeight * 0.9, 18),
  });
  hub.emit({
    count: 60,
    lifetime: [0.5, 1.2],
    speed: [short * 0.08, short * 0.3],
    size: [1.2, 2.8],
    color: new THREE.Color('#A8DCF0'),
    shape: 'sphere',
    spread: width * 0.34,
    looping: true,
    rate: 44,
    position: new THREE.Vector3(0, surfaceY + height * 0.06, 4),
  });

  let lastNow = ctx.now;
  /** 刚体世界已推进的秒数，用于按场景时间轴补齐固定步长。 */
  let physicsElapsed = 0;
  // 弹性/摩擦/刚度取水的物理签名（restitution .72 = 水里的卵石弹一下就停）。
  const identity = MATERIAL_IDENTITIES.water.physical;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, act2, act3] = waterActs(t);
      // 物理时刻：由**场景时间轴**折算而非 frameDelta 累加。后者为防跳帧
      // 压在 50ms 上限，而 update 可能以任意 t 稀疏调用（跨 500ms 只推进
      // 50ms，水珠永远落不了水）。闭式弹道 + 固定步长补齐两者都吃这个 tau。
      const tau = progressToTau(t);

      // ① 水柱（签名）：高度写在 scale.y 上——涌起是真实的几何长高。
      const rise = columnRise(t);
      const breakup = columnBreak(t);
      parts.column.scale.set(1 + breakup * 0.28, Math.max(0.001, rise), 1);
      const columnUniforms = parts.column.material.uniforms;
      columnUniforms.uTime.value = seconds;
      // uRise 是「充水程度」而非高度：刚顶起时柱身稀薄，涨满后才实。
      columnUniforms.uRise.value = Math.min(1, act1 * 1.1);
      columnUniforms.uBreak.value = breakup;

      // 当帧柱顶：水珠的出膛点、白沫的溅射点、雾的中心全挂在它上面。
      const crestY = surfaceY + rise * columnHeight;

      // ② 水珠：闭式弹道逐颗求值（抛物线由 ballisticY 给，重力在 tau 上积分）。
      driveDroplets(drops, tau, gravity);
      // ⑦ 水花白边：跟着柱顶溅，随失稳程度错峰撕开。
      driveFoam(drops, parts.column.position.x, crestY, breakup, short);

      // ③ 互动①：水珠落地激起涟漪。每圈的启动时刻与圆心都从**绑定的那颗
      // 水珠**读——触底时刻是它弹道方程的解，圆心是它的触底横坐标。
      for (const ripple of parts.ripples) {
        const source = ripple.sourceIndex >= 0 ? drops.droplets[ripple.sourceIndex] : null;
        const uniforms = ripple.mesh.material.uniforms;
        if (!source || !Number.isFinite(source.impactTau)) {
          // 绑定的水珠永不触底（重力为 0 之类）→ 这圈涟漪永不启动。
          uniforms.uRadius.value = 0;
          uniforms.uFade.value = 0;
          continue;
        }
        const sinceImpact = tau - source.impactTau;
        const radius = rippleRadius(sinceImpact);
        uniforms.uRadius.value = radius;
        // 波前摊平即消失：能量随半径摊在更长圆周上。
        uniforms.uFade.value = radius > 0
          ? Math.max(0, 1 - sinceImpact / (WATER_RIPPLE_LIFE_S * 1.6)) * 0.9
          : 0;
        // 圆心跟着落点走：涟漪开在水珠落水的地方，不是固定在屏心。
        ripple.mesh.position.x = source.impactX;
      }

      // ④ 互动②：水雾在水柱峰顶散开——层中心跟随当帧柱顶。
      for (let i = 0; i < parts.mistLayers.length; i += 1) {
        const layer = parts.mistLayers[i];
        const uniforms = layer.material.uniforms;
        const drift = 0.6 + i * 0.5;
        uniforms.uTime.value = seconds * drift;
        // 涌起期起雾、崩散期最浓（水被撕碎成雾）、尾幕雾散。
        uniforms.uDensity.value = Math.max(
          0, act1 * (0.34 + breakup * 0.52) * (1 - act3 * 0.82),
        );
        uniforms.uFlash.value = Math.pow(Math.max(0, 1 - Math.abs(act2 - 0.18) / 0.2), 2) * 0.4;
        // 中心随柱顶抬升：柱涨雾升，柱崩雾跟着落回水面并向外摊开。
        layer.position.set(
          Math.sin(seconds * drift * 0.5) * width * 0.02 * drift,
          crestY - height * 0.05 * i,
          i * 2,
        );
        layer.scale.setScalar(1 + breakup * 0.16 * drift + act3 * 0.22);
      }

      // ⑤ 底光：涌起期聚能（水被抽走、池底透光），崩散期最亮，尾幕回落。
      const bedUniforms = parts.bedLight.material.uniforms;
      bedUniforms.uTime.value = seconds;
      bedUniforms.uEnergy.value = act1 * (0.42 + Math.sin(act2 * Math.PI) * 0.45) * (1 - act3 * 0.55);

      // ⑥ 鹅卵石：被涌起的水推动。第一幕不动（水柱还没起）。
      for (const pebble of parts.pebbles) {
        if (!pebble.pushed && tau >= pebble.pushAt && act2 > 0) {
          pebble.pushed = true;
          pebble.body.type = Body.DYNAMIC;
          // 质量在构建时已给好，这里只让 cannon 重算惯性张量。
          pebble.body.updateMassProperties();
          pebble.body.wakeUp();
          // 初速由 stiffness（水的 .35）驱动。identity.force 是力的**类型枚举**
          // （'fluid'），不是可乘的量级，当乘数会算出 NaN 让刚体冻结。
          const push = short * 1.5 * identity.stiffness;
          const outward = Math.sign(pebble.body.position.x || 1);
          pebble.body.velocity.set(outward * push * 0.5, push, 0);
          pebble.body.angularVelocity.set(0, 0, -outward * 6);
        }
      }

      let guard = 0;
      while (physicsElapsed + PHYSICS_STEP <= tau && guard < MAX_PHYSICS_CATCHUP) {
        parts.world.step(PHYSICS_STEP);
        physicsElapsed += PHYSICS_STEP;
        guard += 1;
        for (const pebble of parts.pebbles) {
          if (!pebble.pushed) continue;
          const body = pebble.body;
          const rest = surfaceY + pebble.radius;
          // 泉底接触**完全**在这里给：夹紧 + 按 restitution 翻转竖直速度。
          // cannon 的默认 ContactMaterial 无弹性，一个 Plane 刚体只会挡住穿透
          // 而不会回弹；而本场景的落地位置由下面这几行解析地钉在 rest 上，
          // Plane 的接触因此永远不会产生冲量——它是纯粹的死代码
          // （变异验证：删掉那个 Plane，15 条断言全绿）。所以那具尸体已移除，
          // 泉底只剩这一条真正生效的路径。cannon 负责的是重力/阻尼/姿态积分。
          if (body.position.y <= rest && body.velocity.y < 0) {
            body.position.y = rest;
            body.velocity.y = -body.velocity.y * identity.restitution;
            body.velocity.x *= 1 - identity.friction;
          }
        }
      }
      for (const pebble of parts.pebbles) {
        // 位姿**原样**抄自刚体，不在显示层夹地面：那样做会把「卵石没穿透泉底」
        // 变成一句显示层的谎——刚体真穿下去了，画面上照样贴着泉底，
        // 验收里的不穿透断言就测不到物理（本条已由变异验证证实）。
        // 真正的夹紧发生在固定步之后的接触处理里（连同 restitution 一起）。
        const p = pebble.body.position;
        pebble.mesh.position.set(p.x, p.y, p.z);
        const q = pebble.body.quaternion;
        pebble.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }

      // ⑧ 虹影：水雾最浓时屏缘色散最明显，尾幕随雾一起散。
      const fringeUniforms = parts.fringe.material.uniforms;
      fringeUniforms.uAlpha.value = act1 * (0.16 + Math.sin(act2 * Math.PI) * 0.3) * (1 - act3 * 0.7);
      fringeUniforms.uSpread.value = act1 * 0.6 + act2 * 1.4 + act3 * 0.8;
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      // 刚体先摘干净：World 无 dispose，留着 body 会让 broadphase 持有引用。
      while (parts.world.bodies.length > 0) parts.world.removeBody(parts.world.bodies[0]);
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'water',
    title: '深泉水跃',
    elements: ['水柱', '水珠', '涟漪环', '水雾', '底光', '鹅卵石', '水花白边', '虹影'],
    signature: '唯一"流体柱崩散"；与 downpour 的"雨帘"形成材质对照',
    preset: 'water-splash',
  },
  createWaterStage,
);

export { createWaterStage };
