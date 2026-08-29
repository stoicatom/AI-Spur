/**
 * 场景 27 spear（dash · 破空长矛，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 27；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createSpearStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'spear',
    title: '破空长矛',
    elements: ['矛 mesh', '螺旋气流', '破空纹', '命中震荡', '矛杆震动', '靶板裂纹', '气流云', '枪头闪光'],
    signature: '唯一"螺旋气流加持的直飞"；与 ninja-star（回旋）同为投掷但轨迹相反',
    preset: 'dash',
  },
  createSpearStage,
);
