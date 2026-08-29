/**
 * 场景 21 bell（echo · 古钟余韵，1200ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 21；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createBellStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'bell',
    title: '古钟余韵',
    elements: ['钟身 mesh', '撞球', '钟波', '泛音光环', '余韵拖尾', '空气波纹', '钟舌残影', '背景庙宇剪影'],
    signature: '唯一"驻波+泛音分层"可视；与吉他（弦→音孔）机制不同（钟体→空间泛音）',
    preset: 'echo',
  },
  createBellStage,
);
