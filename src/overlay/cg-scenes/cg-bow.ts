/**
 * 场景 24 bow（dash · 一箭穿云，1200ms）。
 *
 * 三幕（规格 §4.2 场景 24）：
 * - 0–300ms    拉弓蓄力
 * - 300–800ms  箭出穿云 + 云缝
 * - 800–1200ms 靶心涟漪 + 云缝合拢
 *
 * 互动：①弓弦松开速度反推弓身震动——震动幅度由 limbShake 驱动，
 * 其初值取自松弦瞬间的回弹速度，弦不松弓不震；②云缝在箭过后缓慢
 * 合拢——缝的每一段各自记录「箭何时经过这里」，愈合从那一刻起算。
 *
 * 独立签名：**唯一「拉弓-放箭-云缝合拢」叙事**。全库其它场景的形变
 * 都是单向的（碎了就是碎了、爆了就散了），只有这里的介质会自己长回去。
 * 与 katana 同为 dash 物理但机制相反：katana 过处是永久斩痕，
 * bow 的云缝是暂态的——两者的形变曲线因此一个单调张开、一个张后回落。
 *
 * 元素搭建在 ./bow-parts，弹道与形变数学在 ./bow-ballistics。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildBowParts } from './bow-parts';
import { RIFT_SEGMENTS } from './bow-shaders';
import {
  DRAW_END,
  FLIGHT_END,
  arrowPassTime,
  arrowProgress,
  limbShake,
  riftOpening,
  stringDraw,
} from './bow-ballistics';

/** 第一幕结束点（300/1200）。 */
export const BOW_ACT1_END = DRAW_END;
/** 第二幕结束点（800/1200）。 */
export const BOW_ACT2_END = FLIGHT_END;

function createBowStage(ctx: CgStageContext): CgStage {
  const parts = buildBowParts(ctx);
  const {
    res, backdrop, cloud, body, arrow, cone, ripples, wisps,
    from, to, scale,
  } = parts;
  const { width, height } = ctx;

  const path = to.clone().sub(from);
  const pathAngle = Math.atan2(path.y, path.x);
  const pathLength = path.length();

  // ④ 箭羽拖尾（规格元素④）：几何贴片表达不了轻羽流。
  const hub = createParticleHub(res.group, ctx.quality);
  const featherPos = new THREE.Vector3(from.x, from.y, 4);
  const feathers = hub.emit({
    count: 88,
    lifetime: [0.3, 0.85],
    speed: [scale * 0.5, scale * 2.2],
    size: [1.5, 4],
    color: new THREE.Color('#E8EEFF'),
    shape: 'cone',
    spread: 0.4,
    position: featherPos,
    looping: true,
    rate: 64,
  });

  // 拖尾锚点：quarks 会把 emitter 从场景树摘走，锚点让发射点可定位。
  const featherAnchor = new THREE.Object3D();
  featherAnchor.name = 'feather-anchor';
  res.group.add(featherAnchor);

  // 云缝每段的「箭经过时刻」：构建期一次性算好，运行期只查表。
  // 这让「缝跟着箭走」是数据依赖，而不是各段自己定时。
  const segmentPassAt: number[] = [];
  for (let i = 0; i < RIFT_SEGMENTS; i += 1) {
    segmentPassAt.push(arrowPassTime(i / (RIFT_SEGMENTS - 1)));
  }

  const riftOpen = cloud.material.uniforms.uOpen.value as Float32Array;
  let lastNow = ctx.now;
  const arrowPos = new THREE.Vector3();

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, act2, act3] = acts(t, BOW_ACT1_END, BOW_ACT2_END);
      const draw = stringDraw(t);
      const shake = limbShake(t);
      const progress = arrowProgress(t);

      // ⑧ 远处闪电暗场：整幕在场，偶有低频闪。
      backdrop.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.6);
      backdrop.material.uniforms.uFlash.value =
        Math.max(0, Math.sin(t * Math.PI * 5.3)) * 0.4 * (1 - act3 * 0.5);

      // ① 弓身：弦的拉伸量与弓臂震动。
      body.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.8);
      body.material.uniforms.uDraw.value = draw;
      // 互动① 震动由松弦速度驱动：弦不松弓不震。
      body.material.uniforms.uShake.value = shake;

      // ② 箭矢：沿轨迹飞行，箭头始终对准航向。
      arrowPos.set(from.x + path.x * progress, from.y + path.y * progress, 8);
      arrow.position.copy(arrowPos);
      arrow.rotation.z = pathAngle;
      // 离弦后才可见，命中后隐没在涟漪里。
      arrow.material.opacity = t < DRAW_END ? 0 : (1 - act3);

      // ⑤ 破空锥：跟着箭头，速度越快锥越尖。
      cone.position.copy(arrowPos);
      cone.rotation.z = pathAngle;
      // 箭在减速，所以马赫数随进度**下降**（与 meteor 的再入加速相反）。
      const speedRatio = t < DRAW_END || t > FLIGHT_END ? 0 : 1 - progress * 0.65;
      cone.material.uniforms.uMach.value = 1.15 + speedRatio * 2.2;
      cone.material.uniforms.uAlpha.value = speedRatio > 0 ? speedRatio * 0.85 : 0;

      // ③ 互动② 云缝：每段各自从「箭经过它」的时刻起张开再愈合。
      cloud.material.uniforms.uTime.value = seconds;
      cloud.material.uniforms.uAlpha.value = Math.min(1, act1 * 1.5);
      for (let i = 0; i < RIFT_SEGMENTS; i += 1) {
        riftOpen[i] = riftOpening(t, segmentPassAt[i]);
      }
      cloud.material.uniformsNeedUpdate = true;

      // ⑦ 云絮被卷：各自在箭经过时被带偏，之后缓慢回位。
      for (const wisp of wisps) {
        const passAt = arrowPassTime(wisp.along);
        const since = t - passAt;
        const base = new THREE.Vector2(
          from.x + path.x * wisp.along,
          from.y + path.y * wisp.along,
        );
        if (since < 0) {
          wisp.mesh.position.set(base.x, base.y, -10);
          wisp.mesh.material.opacity = 0.18 * act1;
          continue;
        }
        // 被卷开：沿轨迹法向推出，随后按与云缝相同的节奏回落。
        const kick = riftOpening(t, passAt);
        const nx = -path.y / pathLength;
        const ny = path.x / pathLength;
        const push = kick * scale * 2.6 * wisp.lateral;
        wisp.mesh.position.set(base.x + nx * push, base.y + ny * push, -10);
        wisp.mesh.material.opacity = 0.18 * act1 + kick * 0.35;
      }

      // ⑥ 靶心涟漪：命中后（第三幕）三圈外扩。
      for (let i = 0; i < ripples.length; i += 1) {
        const ring = ripples[i];
        const delay = i * 0.1;
        const local = Math.max(0, act3 - delay) / Math.max(0.001, 1 - delay);
        ring.material.opacity = local > 0 ? Math.sin(local * Math.PI) * 0.7 : 0;
        ring.scale.setScalar(1 + local * (2.2 + i * 0.8));
      }

      // ④ 箭羽拖尾：发射点跟着箭尾。
      featherPos.set(
        arrowPos.x - (path.x / pathLength) * scale * 1.7,
        arrowPos.y - (path.y / pathLength) * scale * 1.7,
        4,
      );
      featherAnchor.position.copy(featherPos);
      if (feathers) {
        feathers.emitter.position.copy(featherPos);
        // 只在飞行期吐羽。
        feathers.emissionOverTime = new ConstantValue(act2 > 0 && act3 < 1 ? 70 : 2);
      }

      // 屏宽兜底：云与背景都已按倍数建。
      void width;
      void height;
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
    packId: 'bow',
    title: '一箭穿云',
    elements: [
      '弓身与弓弦', '箭矢', '穿云缝', '箭羽拖尾',
      '破空锥', '靶心涟漪', '云絮被卷', '远处闪电暗场',
    ],
    signature: '唯一"拉弓-放箭-云缝合拢"叙事；与 katana（刀）同为 dash 物理但场景完全独立',
    preset: 'dash',
  },
  createBowStage,
);

export { createBowStage };
