/**
 * 场景 07 crystal（shatter · 水晶碎玉，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 07；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createCrystalStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'crystal',
    title: '水晶碎玉',
    elements: ['水晶塔', '晶面逐层剥离', '棱光', '晶屑', '光斑拖影', '底部尘雾', '折射光棱', '碎晶音画同步'],
    signature: '唯一"层级剥落"碎裂方式；真实折射材质全库唯一',
    preset: 'shatter',
  },
  createCrystalStage,
);
