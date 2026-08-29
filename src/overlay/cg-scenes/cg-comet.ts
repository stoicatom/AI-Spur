/**
 * 场景 18 comet（trail-burst · 彗星掠日，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 18；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createCometStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'comet',
    title: '彗星掠日',
    elements: ['彗核', '彗尾', '近日点闪光', '尾迹断裂', '星空粒子', '拖尾环', '日球风', '尾梢爆星'],
    signature: '唯一"双向彗尾（离子+尘埃）"物理区分；与 meteor 的"再入火鞘"同为天体但机制完全不同',
    preset: 'trail-burst',
  },
  createCometStage,
);
