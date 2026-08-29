/**
 * 场景 41 fireworks（fireworks · 花火大会，1950ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 41；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createFireworksStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'fireworks',
    title: '花火大会',
    elements: ['升空弹', '第一炸', '多层形态珠', '残珠雨', '连环弹', '烟环', '夜幕背景', '倒影', '光雾残留'],
    signature: '唯一"升空-延时爆开-多形态-连环"全过程；三珠形态（百合/牡丹/星芒）全库唯一',
    preset: 'fireworks',
  },
  createFireworksStage,
);
