/**
 * 场景 19 guitar（pulse · 声弦，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 19；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createGuitarStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'guitar',
    title: '声弦',
    elements: ['琴身 mesh', '琴弦', '弦波传导', '音浪环', '拨片闪光', '共鸣光', '泛音点', '碎尘'],
    signature: '唯一"弦振传波"机制（弦→音孔→环层级传导全库唯一）',
    preset: 'pulse',
  },
  createGuitarStage,
);
