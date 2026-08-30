/**
 * 场景 07 crystal（水晶碎玉）—— 设计规格 §4.2 场景 07 的实现。
 *
 * 签名两条，别的碎裂场景都没有：
 *   ① 层级剥落：晶面自塔顶而下逐层剥离（8 层），不是一次性炸开；
 *   ② 真实折射材质：全库唯一用 transmission/ior 做真透射折射的场景。
 *
 * 三幕（1200ms）：0–200 晶塔悬停蓄力；200–800 逐层崩解、晶屑四散反弹；
 * 800–1200 尘雾沉积、余晶静止。
 */
import * as THREE from 'three';
import type { CgStage, CgStageContext } from '../cg-scene';
import { registerScene } from '../cg-scene-registry';
import { acts, createSceneResources, frameDelta } from '../cg-scene-kit';
import { MATERIAL_IDENTITIES } from '../material-identity';
import { PEEL_LAYERS, createPeelLayers, createRefractiveMaterial, createTower } from './crystal-parts';
import {
  createAfterglow, createAudioStrobe, createDustVeil, createEdgeDispersion,
  createGrainHub, createPrismGlow, visualFlickerHz,
} from './crystal-veils';
import { createChipField } from './crystal-shards';

const ACT1_END = 200 / 1200;
const ACT2_END = 800 / 1200;

/** 每层剥离占第二幕的时间份额：留出重叠，崩解才连贯而非八次独立抽动。 */
const PEEL_WINDOW = 0.42;

/** 尘雾被砸起后的衰减时间常数（秒）：扬尘不是瞬灭，也不该常亮。 */
const KICK_DECAY = 0.55;

function createCrystalStage(ctx: CgStageContext): CgStage {
  // 全屏覆盖：锚在屏心而非触发点，晶塔居中不随鞭梢漂移。
  const res = createSceneResources(ctx.root, new THREE.Vector3(), 'cg-crystal');
  const span = Math.min(ctx.width, ctx.height) * 0.92;
  const identity = MATERIAL_IDENTITIES.crystal;
  // 频闪节拍：声学共振降八度到可见频段，见 visualFlickerHz。
  const flickerHz = visualFlickerHz(identity.acoustic.resonanceHz);
  // 地面取屏幕下缘略上：晶屑堆在可见范围内，不落到画外。
  const groundY = -ctx.height * 0.42;

  const crystalMaterial = createRefractiveMaterial(res, ctx.color);
  const tower = createTower(res, ctx, span, crystalMaterial);
  const layers = createPeelLayers(res, span, crystalMaterial);
  const prism = createPrismGlow(res, ctx, span);
  const chipField = createChipField(res, ctx, span, groundY, crystalMaterial);
  const afterglow = createAfterglow(res, ctx, span, chipField.chips.length);
  const dustVeil = createDustVeil(res, ctx);
  const dispersion = createEdgeDispersion(res, ctx);
  const strobe = createAudioStrobe(res, ctx);
  const grain = createGrainHub(ctx, span);

  const coreUniforms = (tower.core.material as THREE.ShaderMaterial).uniforms;
  const prismUniforms = (prism.material as THREE.ShaderMaterial).uniforms;
  const veilUniforms = (dustVeil.material as THREE.ShaderMaterial).uniforms;
  const dispersionUniforms = (dispersion.material as THREE.ShaderMaterial).uniforms;
  const strobeMaterial = strobe.material as THREE.MeshBasicMaterial;
  const afterglowMaterial = afterglow.sprites[0]?.material as THREE.MeshBasicMaterial | undefined;

  // 每层的静止基准：剥离是相对初始位姿的偏移，逐帧重算避免累积漂移。
  const restY = layers.map((layer) => layer.position.y);
  let lastNow = ctx.now;
  /** 扬尘强度自持衰减，由落地事件抬升——互动①靠这个变量成立。 */
  let kick = 0;
  let seenLandings = 0;

  return {
    update(t: number, now: number): void {
      if (res.disposed) return;
      const delta = frameDelta(now, lastNow);
      lastNow = now;
      const time = now / 1000;
      const [a1, a2, a3] = acts(t, ACT1_END, ACT2_END);

      // ── 第一幕：悬停蓄力 ──
      // 塔芯亮带自下而上爬升，爬到顶即崩解，蓄力方向与剥离方向同源。
      coreUniforms.uCharge.value = a2 > 0 ? Math.max(0, 1 - a2 * 2.2) : a1;
      coreUniforms.uTime.value = time;
      // 蓄力期整塔轻微膨胀：应力累积的可读信号。
      const swell = 1 + a1 * 0.035 * (1 - a2);
      tower.group.scale.setScalar(swell);

      // ── 第二幕：逐层剥离 + 晶屑崩解 ──
      let peeling = 0;
      let peeledCount = 0;
      for (let i = 0; i < PEEL_LAYERS; i += 1) {
        // 层 i 的起始时刻沿层序推后：顶层先走，底层最后，
        // 这是签名「层级剥落」的时间骨架。
        const start = (i / PEEL_LAYERS) * (1 - PEEL_WINDOW);
        const local = Math.min(1, Math.max(0, (a2 - start) / PEEL_WINDOW));
        const layer = layers[i];
        if (local <= 0) {
          layer.scale.setScalar(1);
          layer.position.y = restY[i];
          layer.rotation.set(0, 0, 0);
          continue;
        }
        peeledCount += 1;
        // 张开：壳体沿径向外扩，同时下坠并翻转——剥落而非平移消失。
        layer.scale.setScalar(1 + local * 1.55);
        layer.position.y = restY[i] - local * span * 0.5;
        layer.rotation.z = local * (i % 2 === 0 ? 1 : -1) * 1.1;
        layer.rotation.x = local * 0.7;
        // 剥离进行中的层贡献棱光：爆发量随「正在剥的层数」走。
        peeling += Math.sin(Math.min(1, local) * Math.PI);
      }
      // 全 8 层剥完即视为塔体崩解：晶屑此刻开始自由飞散。
      if (a2 > 0.02) chipField.burst();

      // ── 互动②：棱光在剥离瞬间爆发 ──
      prismUniforms.uBurst.value = Math.min(1.6, peeling * 0.34);
      prismUniforms.uHue.value = (t * 2.4 + peeledCount * 0.11) % 1;
      prismUniforms.uTime.value = time;

      // ── 晶屑物理 ──
      chipField.update(delta);

      // ── 互动①：晶屑弹跳扬起尘雾 ──
      // 尘雾强度由落地事件抬升，帧间自持衰减；没有落地就永远是 0，
      // 因此这不是一条独立时间曲线，而是物理事件的直接结果。
      if (chipField.landings > seenLandings) {
        const fresh = chipField.landings - seenLandings;
        seenLandings = chipField.landings;
        kick = Math.min(1, kick + fresh * 0.16);
      }
      if (delta > 0) kick = Math.max(0, kick - delta / KICK_DECAY * kick);
      veilUniforms.uKick.value = kick;
      // 沉积是第三幕专属：a3 在 800ms 前恒为 0，守住幕边界。
      veilUniforms.uSettle.value = a3 * 0.9;
      veilUniforms.uTime.value = time;

      // ── ⑤ 光斑拖影：跟随晶屑，速度越快越亮 ──
      if (afterglowMaterial) {
        afterglowMaterial.opacity = Math.max(0, a2 * 0.9 * (1 - a3));
      }
      for (let i = 0; i < afterglow.sprites.length; i += 1) {
        const sprite = afterglow.sprites[i];
        const chip = chipField.chips[i];
        if (!chip || a2 <= 0) {
          sprite.visible = false;
          continue;
        }
        const { body } = chip;
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        // 静止的晶屑不该拖影：拖影是运动的产物。
        sprite.visible = speed > span * 0.25;
        sprite.position.set(chip.mesh.position.x, chip.mesh.position.y, 0);
        sprite.rotation.z = Math.atan2(body.velocity.y, body.velocity.x);
        const stretch = 1 + Math.min(4.5, speed / (span * 0.8));
        sprite.scale.set(stretch, 1, 1);
      }

      // ── ⑦ 屏缘色散：崩解期最强，尾幕退去 ──
      dispersionUniforms.uIntensity.value = Math.sin(Math.min(1, a2) * Math.PI) * 0.85 * (1 - a3 * 0.8);
      dispersionUniforms.uTime.value = time;

      // ── ⑧ 碎晶音画同步：按 crystal 共振频率闪 ──
      // 频率取声学签名，闪的包络挂在崩解幕上，尾幕自然停。
      const beat = Math.sin(time * flickerHz * Math.PI * 2);
      const envelope = Math.max(0, a2 * (1 - a3));
      strobeMaterial.opacity = Math.max(0, beat) * 0.16 * envelope;

      // ── 细碎晶尘 ──
      // quarks 自管生命周期，这里只推进时间；崩解幕之前不推进，
      // 免得第一幕就把一次性爆发的额度烧掉。
      if (a2 > 0) grain.update(delta);
    },

    dispose(): void {
      chipField.dispose();
      grain.dispose();
      res.dispose();
    },
  };
}

registerScene(
  {
    packId: 'crystal',
    title: '水晶碎玉',
    elements: [
      '水晶塔', '晶面剥落层', '折射棱光', '晶屑刚体', '光斑拖影',
      '底部尘雾', '折射光棱', '碎晶音画同步',
    ],
    signature: '唯一"层级剥落"碎裂方式（晶面自顶而下逐层剥离）+ 全库唯一真实折射材质（transmission/ior）',
    preset: 'shatter',
  },
  createCrystalStage,
);

export { createCrystalStage };
