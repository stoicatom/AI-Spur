/**
 * 场景 09 flame（flame-rise · 篝火升腾，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 09；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createFlameStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'flame',
    title: '篝火升腾',
    elements: ['火舌', '火星', '热浪', '柴堆', '光影脉动', '烟丝', '背景星火', '地面光池'],
    signature: '唯一"连续火焰流"场景；柴堆+光影脉动全库唯一',
    preset: 'flame-rise',
  },
  createFlameStage,
);
