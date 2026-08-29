/**
 * 画质档位与渲染器之间的接线层（设计规格 §3.1）。
 *
 * 预算表（effect-quality-budget）只声明档位意图，渲染器只关心具体数值。
 * 两者之间的换算集中在这里，避免 three-effects 里散落档位判断。
 */
import type { EffectBudget } from './effect-quality-budget';

/**
 * 用档位上限给硬件像素比封顶。
 *
 * 只做下压不做上调：硬件本身给不出的分辨率，档位再高也变不出来。
 */
export function clampPixelRatioToBudget(hardwareRatio: number, budget: EffectBudget): number {
  return Math.min(hardwareRatio, budget.maxPixelRatio);
}
