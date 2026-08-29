/**
 * 场景 35 glass-shot（glass-break · 子弹击碎玻璃，1550ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 35；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createGlassShotStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'glass-shot',
    title: '子弹击碎玻璃',
    elements: ['子弹曳光', '玻璃板', '白斑炸点', '蛛网裂纹', '孔洞拉丝', '玻璃碎片', '碎片反光', '弹道贯穿线', '地面碎渣'],
    signature: '唯一"全屏介质被击碎"；白斑→裂纹→孔洞→碎落的时序全库唯一',
    preset: 'glass-break',
  },
  createGlassShotStage,
);
