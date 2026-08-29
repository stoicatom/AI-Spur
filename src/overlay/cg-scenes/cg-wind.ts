/**
 * 场景 13 wind（whirl · 风旋尘卷，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 13；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createWindStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'wind',
    title: '风旋尘卷',
    elements: ['风场流线', '尘卷', '被卷起的枯叶', '扬尘幕', '地面砂纹', '风眼', '云层快速掠过', '风声频闪'],
    signature: '唯一"旋转流场"环境；枯叶薄片刚体环绕轨迹全库唯一',
    preset: 'whirl',
  },
  createWindStage,
);
