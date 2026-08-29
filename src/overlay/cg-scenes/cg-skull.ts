/**
 * 场景 08 skull（burst · 幽灵骨冢，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 08；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createSkullStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'skull',
    title: '幽灵骨冢',
    elements: ['头骨 mesh', '眼窝鬼火', '幽魂拖影', '骨屑', '磷火飘浮', '地面灰烬环', '月光冷场', '墓碑剪影'],
    signature: '唯一"恐怖叙事"场景；眼窝双光源全库唯一',
    preset: 'burst',
  },
  createSkullStage,
);
