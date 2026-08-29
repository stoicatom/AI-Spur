/**
 * 场景 41 fireworks（fireworks · 花火大会，1950ms）。
 *
 * 三幕（规格 §4.2 场景 41）：
 * - 0–450ms    三枚升空弹错时上行，夜幕与城市遥光立起来
 * - 450–1450ms 第一炸 + 三形态珠 + 连环弹接连绽放
 * - 1450–1950ms 残珠雨滑落 + 光雾残留接管整屏
 *
 * 互动：①残珠雨被后续爆闪照亮——逐颗按「到爆心的实际距离」取衰减，
 * 不是全体统一调亮；②水面倒影的亮度直接取本发爆珠的 flash 值，
 * 因此是真反射而非独立动画；③光雾浓度累计三发的余光，越炸越浑。
 *
 * 独立签名：**升空—延时爆开—多形态—连环**全过程，以及三珠形态
 * （百合/牡丹/星芒）——全库只有这里的花是「先飞上去再按形态炸开」。
 *
 * 元素搭建在 ./fireworks-parts，环境层在 ./fireworks-field-parts，
 * 三珠几何在 ./fireworks-pearls，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildFireworksParts, type FireworkUnit } from './fireworks-parts';

/** 三幕边界（归一化，对应 1950ms）。 */
const ACT1_END = 450 / 1950;
const ACT2_END = 1450 / 1950;

const WHITE = new THREE.Color('#FFFFFF');

/** 本发的爆开进度：未起爆为 0，起爆后 0→1，熄灭后停在 1。 */
function burstProgress(plan: FireworkUnit['plan'], t: number): number {
  return Math.min(1, Math.max(0, (t - plan.onset) / plan.span));
}

/**
 * 本发的爆闪强度：起爆瞬间冲到顶，随后按 1.4 次幂衰减。
 *
 * 前半段用 `p * 8` 而不是直接给 1，是要留出两三帧的「炸开中」窗口，
 * 否则爆珠核会像被开关点亮，读不出炸的过程。
 */
function burstFlash(plan: FireworkUnit['plan'], t: number): number {
  const p = burstProgress(plan, t);
  if (p <= 0 || p >= 1) return 0;
  return Math.min(1, p * 8) * Math.pow(1 - p, 1.4);
}

/** 升空进度：窗口终点对齐本发 onset，因此三枚是错时升空。 */
function riseProgress(plan: FireworkUnit['plan'], t: number): number {
  return Math.min(1, Math.max(0, (t - (plan.onset - plan.riseSpan)) / plan.riseSpan));
}

function createFireworksStage(ctx: CgStageContext): CgStage {
  const parts = buildFireworksParts(ctx);
  const { res, field, units, embers, emberBase, burstRadius } = parts;
  const firstOnset = units[0].plan.onset;
  // 照亮半径：约四倍珠层半径，跨落点也能照到，但不至于整屏一起变白。
  const litRange = burstRadius * 4.5;

  // ③④ quarks 层：爆珠外溅与残珠雨点，规格点名用 quarks。
  // 按发懒发射，让粒子真的在起爆那一刻出现，而不是场景一建就全打出去。
  const hub = createParticleHub(res.group, ctx.quality);
  const sprayed = units.map(() => false);

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, , act3] = acts(t, ACT1_END, ACT2_END);
      let totalLight = 0;

      for (let u = 0; u < units.length; u += 1) {
        const unit = units[u];
        const { plan } = unit;
        const rise = riseProgress(plan, t);
        const flash = burstFlash(plan, t);
        const p = burstProgress(plan, t);
        totalLight += flash;

        // ① 升空弹：0.72 次幂＝出膛快、临顶慢，像失去推力的迫击弹。
        // 到位即消失（已经炸了），拖尾长度随瞬时速度收放。
        const climbing = rise > 0 && rise < 1;
        const lift = THREE.MathUtils.lerp(unit.liftFrom, unit.drop.y, Math.pow(rise, 0.72));
        const speed = climbing ? Math.max(0.25, 1 - rise) : 0;
        unit.shell.position.y = lift;
        unit.shell.material.opacity = climbing ? Math.min(1, rise * 6) * 0.95 : 0;
        unit.trail.position.y = lift - burstRadius * 0.45 * speed;
        unit.trail.scale.set(1, 0.4 + speed * 1.5, 1);
        unit.trail.material.opacity = climbing ? Math.min(1, rise * 4) * 0.5 : 0;

        // ②⑤ 爆珠核：第一炸与连环弹共用同一条曲线，差别只在 onset，
        // 「连环」因此是时间轴的产物，不是三份各自写死的动画。
        unit.core.material.opacity = flash;
        unit.core.scale.setScalar(0.35 + Math.pow(p, 0.45) * 1.5);

        // ③ 三形态珠：整层同生同灭，动作施加在 group 上——
        // 珠子的相对排布是形态本身，逐颗挪动会把花型揉散。
        for (const layer of unit.layers) {
          const alive = p > 0 && p < 1;
          layer.group.scale.setScalar(alive ? 0.08 + Math.pow(p, 0.55) * 1.12 : 0.001);
          layer.group.rotation.z = p * 0.42 * (layer.form === 'starburst' ? -1 : 1);
          // 百合垂枝：随时间下坠，牡丹/星芒不受重力读法影响。
          const sag = layer.form === 'lily' ? Math.pow(p, 1.7) * burstRadius * 0.55 : 0;
          layer.group.position.y = unit.drop.y - sag;
          layer.material.opacity = alive
            ? layer.weight * Math.min(1, p * 6) * Math.pow(1 - p, 1.1)
            : 0;
        }

        // ⑥ 烟环：珠子开始散时才浮出来，是爆珠的余烬而非同步出现的第二个圈。
        const ringFade = Math.max(0, (p - 0.35) / 0.3);
        unit.ring.scale.setScalar(0.3 + Math.pow(p, 0.7) * 1.25);
        unit.ring.material.opacity = p > 0 && p < 1 ? Math.min(1, ringFade) * (1 - p) * 0.55 : 0;

        // 互动②：倒影亮度直接取本发 flash，水里那团光与天上同源。
        unit.reflection.material.opacity = flash * 0.42;
        unit.reflection.scale.set(1.15 + p * 0.5, 0.34 + p * 0.12, 1);

        // ③④ 起爆那一帧补一层 quarks 外溅。
        if (p > 0 && !sprayed[u]) {
          sprayed[u] = true;
          hub.emit({
            count: 90,
            lifetime: [0.35, 0.9],
            speed: [burstRadius * 1.2, burstRadius * 3.4],
            size: [2, 6],
            color: ctx.color.clone().lerp(WHITE, 0.3),
            shape: 'sphere',
            spread: burstRadius * 0.3,
            position: unit.drop.clone(),
          });
        }
      }

      // ④ 残珠雨：从爆点剥落后一路滑到屏下，逐颗错峰出发。
      const emberLife = Math.min(1, Math.max(0, (t - firstOnset) / (1 - firstOnset)));
      const emberAlpha = Math.min(1, emberLife * 2.6) * (1 - act3 * 0.15);
      for (const ember of embers) {
        const travel = Math.max(0, emberLife - ember.phase * 0.06);
        ember.mesh.position.set(
          ember.from.x + Math.sin(seconds * 1.6 + ember.phase * 5) * ember.drift * 0.35,
          ember.from.y - travel * ember.fallSpeed,
          0,
        );
        ember.material.opacity = emberAlpha * (0.55 + Math.sin(ember.phase * 7) * 0.2);

        // 互动①：逐颗按到各爆心的实距取最强的一发，近的被照白、远的仍是暖橙。
        let lit = 0;
        for (const unit of units) {
          const flash = burstFlash(unit.plan, t);
          if (flash <= 0) continue;
          const d = ember.mesh.position.distanceTo(unit.drop);
          lit = Math.max(lit, flash * Math.exp(-Math.pow(d / litRange, 2)));
        }
        ember.material.color.copy(emberBase).lerp(WHITE, Math.min(0.8, lit * 0.9) * (1 - act3));
      }

      // ⑦ 夜幕：星空全程在场（只走时间，不做淡出——共享的星场 shader
      // 自算 alpha，改 material.opacity 对它无效，写了只会是假动作）；
      // 城市遥光第一幕点亮，末幕被烟雾压下去一档。
      field.starField.uniforms.uTime.value = seconds;
      field.cityGlow.uniforms.uTime.value = seconds;
      const cityLevel = Math.pow(act1, 0.6) * (1 - act3 * 0.35);
      field.cityGlow.uniforms.uIntensity.value = cityLevel;
      field.cityGlow.opacity = cityLevel;

      // ⑧ 水面：第一发升空时开始泛光，随后跟着爆闪起伏。
      field.waterMaterial.uniforms.uTime.value = seconds;
      const waterLevel = Math.min(1, act1 * 0.5 + totalLight * 0.9);
      field.waterMaterial.uniforms.uIntensity.value = waterLevel;
      field.waterMaterial.opacity = waterLevel;
      field.horizonLine.material.opacity = 0.15 + Math.min(0.5, totalLight * 0.7);

      // ⑨ 光雾残留：互动③——三发余光累计成底噪，末幕再由 act3 抬成整屏柔光。
      // ShaderMaterial 的自定义 fragment 不会自动乘 material.opacity，
      // 这里与 uIntensity 同步赋值，让层的可见度在场景树里也读得出来。
      field.haze.uniforms.uTime.value = seconds;
      const hazeLevel = Math.min(1, totalLight * 0.35 + Math.pow(act3, 0.8) * 1.1);
      field.haze.uniforms.uIntensity.value = hazeLevel;
      field.haze.opacity = hazeLevel;
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
    packId: 'fireworks',
    title: '花火大会',
    elements: ['升空弹', '第一炸', '多层形态珠', '残珠雨', '连环弹', '烟环', '夜幕背景', '倒影', '光雾残留'],
    signature: '唯一"升空-延时爆开-多形态-连环"全过程；三珠形态（百合/牡丹/星芒）全库唯一',
    preset: 'fireworks',
  },
  createFireworksStage,
);

export { createFireworksStage };
