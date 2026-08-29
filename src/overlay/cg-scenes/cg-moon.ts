/**
 * 场景 15 moon（arc · 月晕弧光，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 15；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createMoonStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'moon',
    title: '月晕弧光',
    elements: ['月面 mesh', '月晕弧', '月出弧光', '碎星陨', '夜云半掩', '月尘', '光晕脉动环', '地面月光池'],
    signature: '唯一"天体升沉"场景；与 sun 的"日冕辉光"互为昼夜对照',
    preset: 'arc',
  },
  createMoonStage,
);
