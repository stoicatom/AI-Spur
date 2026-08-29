/**
 * 场景 20 drum（drum-beat · 战鼓重击，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 20；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createDrumStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'drum',
    title: '战鼓重击',
    elements: ['鼓身 mesh', '鼓槌', '鼓面冲击', '低频环波', '鼓皮粒子', '震屏', '音浪拖影', '锤头火星'],
    signature: '唯一"击打-凹陷-反弹"机制；鼓槌飞入+震屏全库唯一',
    preset: 'drum-beat',
  },
  createDrumStage,
);
