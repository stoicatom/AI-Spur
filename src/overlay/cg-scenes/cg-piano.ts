/**
 * 场景 38 piano（note-dance · 琴键狂想，1800ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 38；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createPianoStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'piano',
    title: '琴键狂想',
    elements: ['琴身 mesh', '键闪', '音符精灵', '五线谱线', '踏板辉光', '共鸣板光', '节拍闪烁', '琴键落下激起音尘'],
    signature: '唯一"旋律演奏"叙事；键盘连击与音符逐一配对（全库唯一）',
    preset: 'note-dance',
  },
  createPianoStage,
);
