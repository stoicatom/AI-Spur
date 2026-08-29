/**
 * 场景 24 bow（dash · 一箭穿云，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 24；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createBowStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'bow',
    title: '一箭穿云',
    elements: ['弓身 mesh + 弓弦', '箭矢', '穿云缝', '箭羽拖尾', '破空锥', '靶心涟漪', '云絮被卷', '远处闪电暗场'],
    signature: '唯一"拉弓-放箭-云缝合拢"叙事；与 katana（刀）同为 dash 物理但场景完全独立',
    preset: 'dash',
  },
  createBowStage,
);
