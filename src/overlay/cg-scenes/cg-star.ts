/**
 * 场景 14 star（star-burst · 星芒礼花，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 14；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createStarStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'star',
    title: '星芒礼花',
    elements: ['五芒星体', '星轨', '星屑', '光晕层', '小星星点缀', '环状波', '色彩微突变', '残星点'],
    signature: '唯一"五轴对称"爆发；随机单帧变色彩蛋全库唯一',
    preset: 'star-burst',
  },
  createStarStage,
);
