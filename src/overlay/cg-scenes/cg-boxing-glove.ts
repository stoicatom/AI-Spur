/**
 * 场景 36 boxing-glove（boxing · 重拳，850ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 36；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createBoxingGloveStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'boxing-glove',
    title: '重拳',
    elements: ['拳套 mesh', '压缩环', '命中间闪光', '拳路残影', '震屏', '拳套变形', '汗滴飞溅', '沙袋虚影'],
    signature: '唯一"命中空气"（无实体目标）；850ms 快节奏全库第二快',
    preset: 'boxing',
  },
  createBoxingGloveStage,
);
