/**
 * 场景 16 sun（glow · 日冕辉光，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 16；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createSunStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'sun',
    title: '日冕辉光',
    elements: ['日核', '日珥', '日冕', '光斑漂移', '热浪', '日辉脉冲环', '紫外线光晕', '太空粒子'],
    signature: '唯一"恒星"场景；日珥卷曲全库唯一',
    preset: 'glow',
  },
  createSunStage,
);
