/**
 * 场景 34 revolver（gunshot · 左轮射击，720ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 34；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createRevolverStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'revolver',
    title: '左轮射击',
    elements: ['枪身 mesh', '枪口焰', '弹壳抛飞', '后坐力', '弹道火光', '硝烟', '转轮偏转', '目标炸点'],
    signature: '唯一"短促击发"（720ms 最快素材）；弹壳刚体抛物线全库唯一',
    preset: 'gunshot',
  },
  createRevolverStage,
);
