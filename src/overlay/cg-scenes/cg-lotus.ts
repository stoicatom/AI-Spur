/**
 * 场景 29 lotus（petal · 莲开，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 29；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createLotusStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'lotus',
    title: '莲开',
    elements: ['莲座 mesh', '花瓣刚体', '水面涟漪', '莲光', '露珠', '荷叶浮影', '萤火', '水下光斑'],
    signature: '唯一"层叠绽放"；与 harp（竖琴花瓣音波）不同——这里是可刚体互动的实体花瓣',
    preset: 'petal',
  },
  createLotusStage,
);
