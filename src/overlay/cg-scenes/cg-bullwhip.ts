/**
 * 场景 37 bullwhip（whip-crack · 甩鞭，1100ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 37；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createBullwhipStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'bullwhip',
    title: '甩鞭',
    elements: ['鞭身', '鞭梢光点', '音爆环', '火花末梢', '鞭声纹', '阻尼摆动', '手部剪影', '搅动气流'],
    signature: '唯一"链段+音爆"物理；阻尼摆动衰减全库唯一',
    preset: 'whip-crack',
  },
  createBullwhipStage,
);
