/**
 * 场景 22 harp（petal · 竖琴花瓣，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 22；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createHarpStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'harp',
    title: '竖琴花瓣',
    elements: ['竖琴框架 mesh', '琴弦', '花瓣音波', '拨弦闪光', '月夜景', '落地晕环', '琴柱辉光', '飘落花瓣刚体'],
    signature: '唯一"竖列弦+花瓣波"组合；拨弦闪光逐列扫描全库唯一',
    preset: 'petal',
  },
  createHarpStage,
);
