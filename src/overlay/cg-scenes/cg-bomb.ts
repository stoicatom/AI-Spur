/**
 * 场景 28 bomb（explode · 爆破，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 28；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createBombStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'bomb',
    title: '爆破',
    elements: ['引信火花', '火球', '冲击波球环', '浓烟蘑菇云', '碎片', '全屏闪光', '压力变形', '灰烬雨', '地面焦圈'],
    signature: '唯一"四层同爆"（火/波/烟/片）；与 fireworks（优美）形成"毁灭"对照',
    preset: 'explode',
  },
  createBombStage,
);
