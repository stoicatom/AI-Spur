/**
 * 场景 01 rocket（jet · 发射升空，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 01；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createRocketStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'rocket',
    title: '发射升空',
    elements: ['引擎主焰', '尾烟两侧', '发射台结构网格', '音爆环', '燃料碎屑', '地平线光带 shader', '背景星点阵', '二级点火亮斑'],
    signature: '唯一自下而上"发射"构图的素材；发射台消隐只此一例',
    preset: 'jet',
  },
  createRocketStage,
);
