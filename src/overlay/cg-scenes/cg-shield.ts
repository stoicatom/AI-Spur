/**
 * 场景 25 shield（impact · 盾御冲击，1200ms）。
 *
 * 三幕（规格 §4.2 场景 25）：
 * - 0–200ms    来击
 * - 200–700ms  盾挡 + 波 + 火花
 * - 700–1200ms 震尘落 + 盾面余辉
 *
 * 互动：①来击幻影撞盾瞬间火花+裂纹同帧——两者读同一个 `impactFlash`；
 * ②冲击波沿盾缘弹开方向与来击方向相反——弹开方向由 `deflect()` 的镜面
 * 反射给出，不是把来击方向取反。
 *
 * 独立签名：**格挡反弹**（动能沿弧面转向）。与 axe/bomb 的击穿/爆裂相反
 * ——那两个场景把入射动能留在被击物里撕开它，本场景的动能不进入盾，
 * 沿盾面弧线转向后离开。签名的可测后果有三条：出射角随撞击点线性转过
 * `2 × 弧法线角`、切向分量整份保留、地面震尘强度只读法向分量
 * （`normalLoad`，即"没被弹开的那一份"）。
 *
 * 签名数学在 ./shield-deflect，时间包络在 ./shield-timeline，
 * 元素搭建在 ./shield-parts、./shield-sparks、./shield-dust，
 * 本文件只做时间轴编排。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import { acts, frameDelta } from '../cg-scene-kit';
import { buildShieldParts } from './shield-parts';
import { createSparkFan } from './shield-sparks';
import { createDustField } from './shield-dust';
import {
  IMPACT_AT,
  IMPACT_OFFSET,
  SHIELD_ACT1_END,
  SHIELD_ACT2_END,
  SHIELD_FACE_ANGLE,
  angleOf,
  normalLoad,
  strikeIncident,
  toScreen,
} from './shield-deflect';
import {
  WAVE_COUNT,
  backlightLevel,
  barrierStrength,
  impactFlash,
  shieldAfterglow,
  strikeApproach,
  waveFade,
  waveRadius,
} from './shield-timeline';

/** 场景总时长（毫秒）。 */
const TOTAL_MS = 1200;

export { SHIELD_ACT1_END, SHIELD_ACT2_END };

function createShieldStage(ctx: CgStageContext): CgStage {
  const parts = buildShieldParts(ctx);
  const {
    res, body, strike, waves, crack, barrier, backlight,
    reach, groundY, short, hitPoint, deflectScreenAngle,
  } = parts;

  const sparks = createSparkFan(res, ctx, hitPoint, deflectScreenAngle, short);
  const dust = createDustField(res, ctx, short, groundY, hitPoint.x);

  // 盾吃下的动能占比：整场恒定（撞击点固定），但它是签名算出来的，
  // 不是手填的常量——`IMPACT_OFFSET` 变了它就跟着变。
  const load = normalLoad(strikeIncident(), IMPACT_OFFSET);
  // 来击方向的屏幕像：幻影沿它飞来，与签名共用同一个 toScreen 变换，
  // 避免元素②与签名各写一遍旋转而悄悄错开。
  const strikeScreenDir = toScreen(strikeIncident(), SHIELD_FACE_ANGLE);
  const strikeScreenAngle = angleOf(strikeScreenDir);
  let lastNow = -1;

  return {
    update(t, now, _quality): void {
      if (res.disposed) return;
      const [, , a3] = acts(t, SHIELD_ACT1_END, SHIELD_ACT2_END);
      // 首帧没有前值可比，给 0 而不是一个凭空的步长。
      const delta = lastNow < 0 ? 0 : frameDelta(now, lastNow);
      lastNow = now;

      // 整场只在这里求这两个量，下面各层都取它们——两个互动因此是同源的
      // 必然结果，不是两处各自调参。
      const flash = impactFlash(t);
      const approach = strikeApproach(t);

      // ① 盾 mesh：受击处热辐射（uGlow）走余辉曲线，闪白走同一个 flash。
      body.material.uniforms.uFlash.value = flash;
      body.material.uniforms.uGlow.value = shieldAfterglow(t);

      // ② 来击虚影：沿来击方向加速扑向盾，撞击后钳在盾面（被挡下，
      // 不穿过去）。位置由 approach 插值，拖影长度随瞬时速度。
      const inbound = strikeScreenDir;
      const travel = (1 - approach) * reach * 0.9;
      strike.position.set(
        hitPoint.x - inbound.x * travel,
        hitPoint.y - inbound.y * travel,
        -1,
      );
      strike.rotation.z = strikeScreenAngle;
      // 拖影随接近速度拉长：k² 的导数 ∝ k，撞击前最长。
      strike.material.uniforms.uSmear.value = approach * 1.15;
      // 撞击后幻影迅速消散：动能已经转向，幻影本体不再存在。
      strike.material.uniforms.uAlpha.value = t < IMPACT_AT
        ? Math.min(1, approach * 1.6)
        : Math.max(0, 1 - (t - IMPACT_AT) * 9);

      // ③ 盾面冲击波：三道错时弧波，沿弹开方向扩到屏缘。
      for (let i = 0; i < WAVE_COUNT; i += 1) {
        const mesh = waves[i];
        mesh.material.uniforms.uRadius.value = waveRadius(t, i, reach);
        mesh.material.uniforms.uAlpha.value = waveFade(t, i, reach) * 0.85;
      }

      // ④ 火花盾缘：发射率读同一个 flash（互动①）。
      sparks.advance(t, delta);

      // ⑤ 盾面战损闪：与火花共用 flash，因此必然同帧（互动①）。
      // uReveal 是裂纹长度——闪光过后裂纹还在，所以它走余辉而非 flash。
      crack.material.uniforms.uFlash.value = flash;
      crack.material.uniforms.uReveal.value = Math.max(flash, shieldAfterglow(t) * 0.6);

      // ⑥ 格挡环：持续屏障，与瞬时闪刻意不同源（余辉需要载体）。
      const shell = barrierStrength(t);
      barrier.material.opacity = shell * 0.55;
      barrier.scale.setScalar(1 + shell * 0.06);

      // ⑦ 地面震尘：起跳冲量读 normalLoad——被盾吃下的那一份动能。
      dust.advance(t, load);
      // 尘在第三幕落定后渐隐。
      dust.setOpacity(t < IMPACT_AT ? 0 : Math.min(0.8, (1 - a3 * 0.85) * 0.8));

      // ⑧ 背光剪影：整幕布光，撞击瞬间被推亮一档。
      backlight.material.uniforms.uLevel.value = backlightLevel(t);
    },

    dispose(): void {
      dust.dispose();
      sparks.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'shield',
    title: '盾御冲击',
    elements: ['盾 mesh', '来击虚影', '盾面冲击波', '火花盾缘', '盾面战损闪', '格挡环', '地面震尘', '背光剪影'],
    signature: '唯一"格挡反弹"力学（动能沿弧面转向）；与 axe/bomb 的"击穿/爆裂"相反',
    preset: 'impact',
  },
  createShieldStage,
);

export { createShieldStage };
export { TOTAL_MS as SHIELD_TOTAL_MS };
