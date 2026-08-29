/**
 * 场景 05 ninja-star（orbit · 回旋手里剑，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 05；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createNinjaStarStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'ninja-star',
    title: '回旋手里剑',
    elements: ['手里剑本体', '残影环', '金属反光扫掠', '回旋轨迹光带', '月轮', '落地火星', '屏边冲击纹', '风切声纹'],
    signature: '唯一"回旋镖式"运动曲线；ghost 残影 5 层全库唯一',
    preset: 'orbit',
  },
  createNinjaStarStage,
);
