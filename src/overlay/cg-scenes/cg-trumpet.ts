/**
 * 场景 23 trumpet（ring · 号角鸣奏，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 23；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createTrumpetStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'trumpet',
    title: '号角鸣奏',
    elements: ['喇叭 mesh', '号口音波', '按键光点', '音符粒子', '金属光泽', '共鸣管波', '号声金光', '背景暖幕'],
    signature: '唯一"吹奏类+定向号口"发声方向设计（与 bell 的四面扩散不同）',
    preset: 'ring',
  },
  createTrumpetStage,
);
