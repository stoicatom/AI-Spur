/**
 * 场景 06 katana（dash · 居合斩，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 06；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createKatanaStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'katana',
    title: '居合斩',
    elements: ['刀身', '斩击线', '刀气弧', '斩击火花', '残影人间', '屏裂闪光', '绸布飘落', '月光静场'],
    signature: '唯一"居合一击"叙事；静场→爆发对比全库最强烈',
    preset: 'dash',
  },
  createKatanaStage,
);
