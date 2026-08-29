/**
 * 场景 10 ice（shatter-ice · 极寒暴雪原野，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 10；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createIceStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'ice',
    title: '极寒暴雪原野',
    elements: ['狂风雪幕', '风力切变', '寒雾', '冰晶虹吸', '地面冰裂纹', '霜白闪光', '冰棱飞散', '极光带'],
    signature: '唯一"两层视差风切雪幕"；冰裂纹扩散全库唯一',
    preset: 'shatter-ice',
  },
  createIceStage,
);
