/**
 * 场景 12 water（water-splash · 深泉水跃，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 12；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createWaterStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
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
