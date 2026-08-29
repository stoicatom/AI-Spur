/**
 * 场景 03 lightning（bolt · 雷暴云幕，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 03；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createLightningStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'lightning',
    title: '雷暴云幕',
    elements: ['雷暴乌云', '三相先导电弧', '云内暗闪', '落雷点地面亮斑', '雨幕', '电弧余波', '雷声光暴', '云缘电荷游灯'],
    signature: '唯一"天象"级场景；先导-暗闪-落雷三相耦合全库唯一',
    preset: 'bolt',
  },
  createLightningStage,
);
