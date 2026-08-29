/**
 * 场景 31 tornado（tornado · 龙卷，1800ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 31；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createTornadoStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'tornado',
    title: '龙卷',
    elements: ['漏斗', '卷入物', '地面沙幕', '根环', '顶部云盖', '碎物', '风眼光柱', '雨旋', '消散畸变'],
    signature: '唯一"垂直气柱+吸入"机制；SDF 噪声旋转体全库唯一特例（时长最长 1800ms）',
    preset: 'tornado',
  },
  createTornadoStage,
);
