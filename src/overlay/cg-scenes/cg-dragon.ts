/**
 * 场景 04 dragon（wave · 腾龙戏珠，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 04；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createDragonStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'dragon',
    title: '腾龙戏珠',
    elements: ['龙身', '鳞光', '龙爪扰动云', '光珠', '龙珠互绕', '雨丝背景', '龙息', '雾境'],
    signature: '唯一"生物链+缠绕"场景；骨骼链 mesh 全库唯一',
    preset: 'wave',
  },
  createDragonStage,
);
