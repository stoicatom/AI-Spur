/**
 * 场景 32 downpour（downpour · 倾盆大雨，1900ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 32；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createDownpourStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'downpour',
    title: '倾盆大雨',
    elements: ['雨帘', '地面雨舞', '涟漪万环', '雨幕深浅', '闪电间隙亮光', '积水反光', '风摆', '雾气沿地'],
    signature: '唯一"全域雨幕"；与 ice 雪幕互为雨雪对照',
    preset: 'downpour',
  },
  createDownpourStage,
);
