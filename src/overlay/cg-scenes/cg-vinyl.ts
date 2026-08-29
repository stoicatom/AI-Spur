/**
 * 场景 40 vinyl（groove · 黑胶，1900ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 40；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createVinylStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'vinyl',
    title: '黑胶',
    elements: ['唱片 mesh', '盘面纹路', '唱针', '音轨光流', '转速视觉', '音尘', '灯语', '旋转影'],
    signature: '唯一"旋转载体+纹路光流"；1900ms 时长并列最长',
    preset: 'groove',
  },
  createVinylStage,
);
