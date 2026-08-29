/**
 * 场景 30 aurora（wave · 极光绸带，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 30；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createAuroraStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'aurora',
    title: '极光绸带',
    elements: ['极光带', '流动光', '星光背景', '雪山剪影', '极光边缘丝', '光影翻卷', '倒影湖面', '爆发点'],
    signature: '唯一"时空绸带"；与 dragon（实体蜿蜒生物）同为 wave 物理但完全不同的媒介',
    preset: 'wave',
  },
  createAuroraStage,
);
