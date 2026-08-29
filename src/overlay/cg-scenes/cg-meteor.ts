/**
 * 场景 17 meteor（comet · 陨火再入，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 17；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createMeteorStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'meteor',
    title: '陨火再入',
    elements: ['陨核', '火鞘', '剥落碎片', '电离尾迹', '音爆锥', '坠地闪光', '尘环', '大气扰动'],
    signature: '唯一"大气再入"热力学叙事；音爆锥+屏幕微震荡全库唯一',
    preset: 'comet',
  },
  createMeteorStage,
);
