/**
 * 场景 08 skull（burst · 幽灵骨冢，1200ms）。
 *
 * 三幕（规格 §4.2 场景 08）：
 * - 0–250ms    头骨裂纹发光
 * - 250–750ms  爆裂 + 鬼火幽魂
 * - 750–1200ms 骨屑落地 + 磷火飘散
 *
 * 互动：①鬼火从眼窝喷出后拖出幽魂——幽魂各层读的是鬼火**实测位置**的
 * 延迟历史帧（skull-wraith），鬼火不动幽魂就不动；②骨屑落地腾起灰烬环——
 * 环的 uLandings 就是刚体落地计数这一运行时真值，不是时间曲线。
 *
 * 独立签名：**唯一「恐怖叙事」场景**（冷场→裂纹→爆裂→余烬的叙事推进，
 * 而非其余场景的单一动作展示）；**眼窝双光源全库唯一**——两盏独立
 * PointLight 由同一份 |x| 镜像生成，对称由构造保证。
 *
 * 元素搭建在 ./skull-parts 与 ./skull-ambience，骨屑刚体在 ./skull-debris，
 * 幽魂拖影在 ./skull-wraith，本文件只做时间轴编排。
 */
import * as THREE from 'three';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { createParticleHub } from '../cg-particle-kit';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildSkullParts } from './skull-parts';
import { createDebrisField } from './skull-debris';

/** 三幕边界（归一化，对应 1200ms）。 */
const ACT1_END = 250 / 1200;
const ACT2_END = 750 / 1200;

function createSkullStage(ctx: CgStageContext): CgStage {
  const parts = buildSkullParts(ctx);
  const { res, skullR, groundY, wisps, wraith } = parts;
  const debris = createDebrisField(res, ctx, skullR, groundY);

  // 粒子层：眼窝焰舌、爆裂骨粉、贴地灰尘。
  const hub = createParticleHub(res.group, ctx.quality);
  for (const wisp of wisps) {
    hub.emit({
      count: 34,
      lifetime: [0.3, 0.75],
      speed: [skullR * 0.6, skullR * 2.2],
      size: [2, 5],
      color: new THREE.Color('#6BFFC8'),
      shape: 'cone',
      spread: 0.5,
      position: wisp.anchor.clone(),
    });
  }
  hub.emit({
    count: 80,
    lifetime: [0.35, 0.9],
    speed: [skullR * 1.4, skullR * 4],
    size: [1.5, 4],
    color: new THREE.Color('#E8E2D2'),
    shape: 'sphere',
    spread: skullR * 0.4,
  });
  hub.emit({
    count: 46,
    lifetime: [0.6, 1.2],
    speed: [skullR * 0.3, skullR * 1.1],
    size: [6, 16],
    color: new THREE.Color('#9AA69B'),
    shape: 'cone',
    spread: 0.9,
    position: new THREE.Vector3(0, groundY, 0),
  });

  let lastNow = ctx.now;
  // 复用一份向量数组喂给幽魂，避免每帧新建。
  const wispProbe = [new THREE.Vector3(), new THREE.Vector3()];

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      hub.update(delta);

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, ACT1_END, ACT2_END);

      // ⑦ 月光冷场：叙事底色，第一幕就铺开，全程在位（末段略退）。
      parts.chill.uniforms.uTime.value = seconds;
      parts.chill.uniforms.uChill.value = 0.35 + Math.pow(act1, 0.6) * 0.65 - act3 * 0.2;

      // ⑧ 墓碑剪影：与冷场同步显影，被鬼火照亮时略提亮。
      parts.setTombstoneOpacity((0.4 + Math.pow(act1, 0.5) * 0.5) * (1 - act3 * 0.25));

      // ① 头骨：第一幕完整并微颤，爆裂瞬间碎去（交给骨屑与粒子）。
      const intact = act2 <= 0 ? 1 : Math.max(0, 1 - act2 * 6);
      parts.cranium.material.opacity = intact;
      parts.jaw.material.opacity = intact;
      const tremor = intact * skullR * 0.02 * act1;
      parts.cranium.position.x = Math.sin(seconds * 41) * tremor;
      parts.cranium.position.y = Math.cos(seconds * 33) * tremor;
      // 颌骨在爆裂瞬间被向下掀开，不是简单淡出。
      parts.jaw.position.y = -skullR * 0.92 - act2 * skullR * 0.9;
      parts.jaw.rotation.z = act2 * 0.5;

      // ① 裂纹：第一幕蔓延发光，爆裂后随头骨一起消失。
      parts.crack.uniforms.uTime.value = seconds;
      parts.crack.uniforms.uSpread.value = Math.pow(act1, 0.8);
      // 临爆前一记骤亮：裂纹亮到极点才炸，是「蓄势」的可读信号。
      parts.crack.uniforms.uGlow.value = intact * (0.25 + Math.pow(act1, 2.2) * 1.15);

      // ② 眼窝鬼火：爆裂幕从眼窝喷出并向上冲，第三幕退去。
      // 喷出量是鬼火的唯一状态源，幽魂与光源都从它派生。
      const jet = Math.pow(Math.min(1, act2 * 1.4), 0.7) * (1 - act3 * 0.85);
      const flicker = 0.72 + Math.abs(Math.sin(seconds * 11)) * 0.28;
      for (let i = 0; i < wisps.length; i += 1) {
        const { flame, light, anchor } = wisps[i];
        // 左右反向的横向摆动：两簇火不同步才有生气。
        const sway = Math.sin(seconds * 6 + i * Math.PI) * skullR * 0.16 * jet;
        flame.position.set(
          anchor.x + sway,
          anchor.y + jet * skullR * 2.4,
          anchor.z + jet * skullR * 0.5,
        );
        flame.material.opacity = jet * flicker;
        flame.scale.setScalar(0.6 + jet * 1.5);
        // 光源钉在焰体上：双光源的照明必须跟着火走，否则只是两个静态灯位。
        light.position.copy(flame.position);
        light.intensity = jet * flicker * 9;
        wispProbe[i].copy(flame.position);
      }

      // ③ 互动①：幽魂拖影读鬼火实测位置的延迟历史帧。
      // 必须在鬼火位置更新之后调用，喂进去的才是本帧真值。
      wraith.follow(wispProbe, jet * 0.9);

      // ④ 骨屑：爆裂后交给刚体自行演化。
      if (act2 > 0) debris.burst();
      debris.update(delta);
      debris.setOpacity(act2 > 0 ? Math.min(1, act2 * 4) * (1 - act3 * 0.25) : 0);

      // ⑥ 互动②：灰烬环强度由骨屑实际落地数驱动。
      const landings = debris.landedCount();
      parts.ashRing.uniforms.uTime.value = seconds;
      parts.ashRing.uniforms.uLandings.value = landings;
      // 单调映射：一片未落则为 0，落得越多灰腾得越浓，饱和后不再增强。
      parts.ashRing.uniforms.uIntensity.value = Math.min(1, landings / (debris.bits.length * 0.6));

      // ⑤ 磷火飘浮：第二幕起零星，第三幕飘满半屏。
      const drift = Math.pow(act2, 1.5) * 0.3 + Math.pow(act3, 0.7);
      for (const mote of parts.phosphor) {
        const climb = (mote.phase + drift * mote.rate * 0.9) % 1;
        mote.mesh.position.set(
          mote.x + Math.sin(seconds * mote.sway + mote.phase * 11) * skullR * 0.3,
          groundY + climb * parts.phosphorSpan,
          0,
        );
        // 升到顶端渐隐：磷火是「飘散」，不该在半空中硬切。
        mote.mesh.scale.setScalar(0.5 + (1 - climb) * 0.9);
      }
      parts.setPhosphorOpacity(Math.min(1, drift) * 0.7);
    },

    dispose(): void {
      if (res.disposed) return;
      hub.dispose();
      debris.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'skull',
    title: '幽灵骨冢',
    elements: [
      '头骨 mesh', '眼窝鬼火', '幽魂拖影', '骨屑',
      '磷火飘浮', '地面灰烬环', '月光冷场', '墓碑剪影',
    ],
    signature: '唯一"恐怖叙事"场景；眼窝双光源全库唯一',
    preset: 'burst',
  },
  createSkullStage,
);

export { createSkullStage };
