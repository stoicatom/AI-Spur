/**
 * 场景 29 lotus（petal · 莲开，1200ms）。
 *
 * 三幕（规格 §4.2 场景 29）：
 * - 0–300ms    花苞（各层皆合，莲光只有一点底光）
 * - 300–800ms  逐层绽放（由内到外错时打开）
 * - 800–1200ms 花瓣漂散 + 萤火
 *
 * 互动：①花瓣开启带动水面涟漪——第 N 环的半径与亮度直接取
 * `layerOpen(t, N)`，该层没开则环半径恒为 0，是**因果**不是并发；
 * ②露珠滚落点起小环——露珠的落水时刻锚在 `layerDelay` 上，
 * 层开了才抖得下来，小环随之而起。
 *
 * 独立签名：**唯一「层叠绽放」**——第 N 层的开启滞后于第 N-1 层，
 * 且滞后量是层序的函数（`layerDelay` 严格单增）。与 harp（逐列空间
 * 扫描，弦亮取决于闪光带此刻扫到哪）刻意不撞：那是空间驱动，
 * 这是层序驱动。花瓣在这里是**可刚体互动的实体**（cannon 片状体，
 * 有升力与水面浮力），而 harp 的花瓣是纯函数画出的音波轨迹。
 *
 * 签名数学在 ./lotus-bloom，元素搭建在 ./lotus-parts，
 * 刚体花瓣在 ./lotus-petals，GLSL 在 ./lotus-shaders。
 */
import * as THREE from 'three';
import { ConstantValue } from 'three.quarks';
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';
import type { EffectQuality } from '../../shared/config';
import { acts, frameDelta } from '../cg-scene-kit';
import { createParticleHub } from '../cg-particle-kit';
import { buildLotusParts } from './lotus-parts';
import { createPetalDrift } from './lotus-petals';
import {
  LOTUS_ACT1_END,
  LOTUS_ACT2_END,
  LOTUS_DURATION_MS,
  LOTUS_LAYER_COUNT,
  bloomOpenness,
  layerOpen,
  petalOpenAngle,
  rippleFadeFromOpen,
  rippleRadiusFromOpen,
} from './lotus-bloom';
import {
  DEW_COUNT,
  dewRingFade,
  dewRingRadius,
  dewRollProgress,
  fireflyOrbit,
} from './lotus-ambience';

export { LOTUS_ACT1_END, LOTUS_ACT2_END };

function createLotusStage(ctx: CgStageContext): CgStage {
  const parts = buildLotusParts(ctx);
  const {
    res, seat, seatPetals, bloomRings, glow, dewRings,
    lilypads, fireflies, caustic, short, waterY,
  } = parts;

  // ⑤露珠：quarks 小水珠。几何件表达不了「滚落」的连续水丝。
  const hub = createParticleHub(res.group, ctx.quality);
  const dewPos = new THREE.Vector3(0, waterY + short * 0.05, -6);
  const dew = hub.emit({
    count: 40,
    lifetime: [0.25, 0.6],
    speed: [short * 0.04, short * 0.16],
    size: [1.6, 4.2],
    color: new THREE.Color('#DFF4FF'),
    shape: 'cone',
    spread: 0.42,
    position: dewPos,
    looping: true,
    rate: 26,
  });

  // 露珠锚点：quarks 的 emitter 会被 BatchedRenderer 从场景树摘走，
  // 要断言位置就得自持一个具名镜像。
  const dewAnchor = new THREE.Object3D();
  dewAnchor.name = 'dew-anchor';
  res.group.add(dewAnchor);

  // ②花瓣刚体层。
  const drift = createPetalDrift(res, ctx, short, waterY);

  let lastNow = ctx.now;

  return {
    update(t: number, now: number, _quality: EffectQuality): void {
      if (res.disposed) return;
      hub.update(frameDelta(now, lastNow));
      lastNow = now;

      const seconds = now / 1000;
      const [act1, , act3] = acts(t, LOTUS_ACT1_END, LOTUS_ACT2_END);
      // 整朵花的开启度：各层均值，signature 的聚合读数。
      const openness = bloomOpenness(t);

      // ① 莲座：每瓣的张角只由**它所在层**的开启进度决定。
      // 层序滞后因此直接落到几何上——这是签名的可见载体。
      for (const { mesh, layer, azimuth, length } of seatPetals) {
        const open = layerOpen(t, layer);
        const angle = petalOpenAngle(open);
        // 张开表现为：绕方位角外倾 + 瓣尖外移。正交相机下用「方位角方向
        // 的位移 + 纵向压缩」表达外倾，比真做 3D 旋转更稳。
        const tilt = Math.sin(angle);
        const rise = Math.cos(angle);
        mesh.position.set(
          Math.cos(azimuth) * length * tilt * 0.72,
          Math.sin(azimuth) * length * tilt * 0.32,
          -0.02 * layer,
        );
        // 花瓣朝外指：本地 +y 是瓣尖方向，转到方位角上。
        mesh.rotation.z = azimuth - Math.PI / 2;
        // 外倾越大，投影越短（花瓣压向水面）。
        mesh.scale.set(1, 0.42 + rise * 0.58, 1);
        mesh.material.opacity = Math.min(1, act1 * 1.5) * (1 - act3 * 0.85);
      }
      // 花苞期整座微微摇：水面托着花在动。
      seat.rotation.z = Math.sin(seconds * 1.4) * 0.02;

      // ③ 互动① 水面涟漪：一层一环，半径与亮度**只吃该层开启进度**。
      // 花苞未开 → open=0 → 半径 0 → 水面无环，因果由函数本身保证。
      for (let layer = 0; layer < bloomRings.length; layer += 1) {
        const ring = bloomRings[layer];
        const open = layerOpen(t, layer);
        const radius = rippleRadiusFromOpen(open, short);
        // 休眠环同时清零缩放与不透明度：只清 opacity 会留下上一帧的
        // scale，场景状态就取决于「怎么走到这一帧」（downpour 踩过）。
        if (radius <= 0) {
          ring.material.opacity = 0;
          ring.scale.set(0, 0, 1);
          continue;
        }
        // 贴水面看是椭圆：纵向压扁。
        ring.scale.set(radius, radius * 0.34, 1);
        ring.material.opacity = rippleFadeFromOpen(open) * 0.55;
      }

      // ④ 莲光：花心随开启度亮起，层叠亮环在 shader 里同构展开。
      glow.material.uniforms.uOpen.value = openness;
      glow.material.uniforms.uTime.value = seconds;
      glow.material.uniforms.uAlpha.value = 0.2 + Math.min(1, act1 * 1.6) * 0.55
        + openness * 0.3;

      // ⑤ 互动② 露珠：滚落到瓣尖脱落，落水点起小环。
      // 发射点跟着「当前最靠前的那颗」滚落进度走。
      let leadRoll = 0;
      for (let i = 0; i < DEW_COUNT; i += 1) leadRoll = Math.max(leadRoll, dewRollProgress(t, i));
      const rollR = short * (0.05 + leadRoll * 0.14);
      dewPos.set(Math.cos(leadRoll * Math.PI * 1.3) * rollR, waterY + short * 0.05 * (1 - leadRoll), -6);
      dewAnchor.position.copy(dewPos);
      if (dew) {
        dew.emitter.position.copy(dewPos);
        dew.emissionOverTime = new ConstantValue(4 + openness * 34);
      }
      for (let i = 0; i < dewRings.length; i += 1) {
        const ring = dewRings[i];
        const radius = dewRingRadius(t, i, short);
        if (radius <= 0) {
          ring.material.opacity = 0;
          ring.scale.set(0, 0, 1);
          continue;
        }
        // 落点：露珠从第 i%层 的瓣尖滑下，环就在那个方位。
        const azimuth = (i / DEW_COUNT) * Math.PI * 2;
        const dropR = short * (0.16 + (i % LOTUS_LAYER_COUNT) * 0.035);
        ring.position.set(Math.cos(azimuth) * dropR, waterY + Math.sin(azimuth) * dropR * 0.34, -11);
        ring.scale.set(radius, radius * 0.34, 1);
        ring.material.opacity = dewRingFade(t, i) * 0.7;
      }

      // ⑥ 荷叶浮影：整幕在场（花从叶间探出），随开启度被莲光照亮一点。
      for (let i = 0; i < lilypads.length; i += 1) {
        const pad = lilypads[i];
        pad.material.uniforms.uTime.value = seconds;
        pad.material.uniforms.uOpen.value = openness;
        pad.material.uniforms.uAlpha.value = 0.42 + Math.min(1, act1 * 1.3) * 0.28;
      }

      // ⑦ 萤火：闭式轨道，第三幕点亮。
      for (let i = 0; i < fireflies.length; i += 1) {
        const dot = fireflies[i];
        const { x, y, glow: lit } = fireflyOrbit(t, i, short);
        dot.position.set(x, waterY + y, -3);
        dot.material.opacity = lit;
        // 亮度也带一点尺寸变化：萤火亮起时看着更大。
        dot.scale.setScalar(0.6 + lit * 0.8);
      }

      // ⑧ 水下光斑：花开则透下去的光更多。
      caustic.material.uniforms.uTime.value = seconds;
      caustic.material.uniforms.uOpen.value = openness;
      caustic.material.uniforms.uAlpha.value = 0.22 + Math.min(1, act1 * 1.2) * 0.2
        + act3 * 0.14;

      // ② 花瓣漂散：层开启度逐步采样，脱落按层序反向排（外层先松）。
      drift.advance(t, layerOpen);
      drift.setOpacity(Math.min(1, act3 * 2.2) * 0.92);
    },

    dispose(): void {
      if (res.disposed) return;
      drift.dispose();
      hub.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'lotus',
    title: '莲开',
    elements: ['莲座 mesh', '花瓣刚体', '水面涟漪', '莲光', '露珠', '荷叶浮影', '萤火', '水下光斑'],
    signature: '唯一"层叠绽放"；与 harp（竖琴花瓣音波）不同——这里是可刚体互动的实体花瓣',
    preset: 'petal',
  },
  createLotusStage,
);

export { createLotusStage };
export { LOTUS_DURATION_MS as LOTUS_TOTAL_MS };
