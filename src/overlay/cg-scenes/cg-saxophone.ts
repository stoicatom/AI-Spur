/**
 * 场景 39 saxophone（note-dance · 爵士萨克斯，1800ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 39；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createSaxophoneStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'saxophone',
    title: '爵士萨克斯',
    elements: ['萨克斯 mesh', '按键流光', '音符摇曳', '管口热雾', '铜管反光带', '节奏鼓点光', '舞台暗幕', '摇摆光束'],
    signature: '唯一"慵懒摇曳"节奏（与 piano 的跳跃、trumpet 的定向号口均不同）',
    preset: 'note-dance',
  },
  createSaxophoneStage,
);
