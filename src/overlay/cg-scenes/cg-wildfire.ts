/**
 * 场景 33 wildfire（wildfire · 野火燎原，1750ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 33；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createWildfireStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'wildfire',
    title: '野火燎原',
    elements: ['火线蔓延', '草地层', '火舌浪', '热浪扭曲', '烟柱', '火星飞升', '风助火力', '地面余烬'],
    signature: '唯一"蔓延式火势"（二维推进）；与 flame（单点火柱）形成对照',
    preset: 'wildfire',
  },
  createWildfireStage,
);
