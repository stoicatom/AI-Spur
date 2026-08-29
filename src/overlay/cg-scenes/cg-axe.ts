/**
 * 场景 26 axe（impact · 斩斧破木，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 26；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createAxeStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'axe',
    title: '斩斧破木',
    elements: ['斧 mesh', '原木', '木屑', '斧光弧', '落地震荡', '木纹断口发光', '回弹斧身', '松脂星点'],
    signature: '唯一"劈裂木料"场景；原木分段分离全库唯一',
    preset: 'impact',
  },
  createAxeStage,
);
