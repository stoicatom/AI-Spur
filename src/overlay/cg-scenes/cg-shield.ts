/**
 * 场景 25 shield（impact · 盾御冲击，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 25；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createShieldStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'shield',
    title: '盾御冲击',
    elements: ['盾 mesh', '来击虚影', '盾面冲击波', '火花盾缘', '盾面战损闪', '格挡环', '地面震尘', '背光剪影'],
    signature: '唯一"格挡反弹"力学（动能沿弧面转向）；与 axe/bomb 的"击穿/爆裂"相反',
    preset: 'impact',
  },
  createShieldStage,
);
