/**
 * 场景 02 phoenix（rise · 浴火重生，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 02；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createPhoenixStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'phoenix',
    title: '浴火重生',
    elements: ['双翼火羽', '凤凰躯干', '头顶火焰冠', '金羽雨', '涅槃光柱', '热浪扭曲层', '云层撕裂', '冲击羽环形波'],
    signature: '唯一"对称双翼+涅槃金雨"；热浪折射屏幕效果全库唯一',
    preset: 'rise',
  },
  createPhoenixStage,
);
