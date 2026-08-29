/**
 * 场景 11 thunder（shock-ring · 雷击山谷，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 11；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createThunderStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'thunder',
    title: '雷击山谷',
    elements: ['地裂雷光', '环形冲击波', '山谷回响尾迹', '碎石跳起', '扬尘', '远山剪影', '天空暗闪', '空气冷凝纹'],
    signature: '唯一"贴地环波"；与 lightning 的"天穹电弧"形成天地对照',
    preset: 'shock-ring',
  },
  createThunderStage,
);
