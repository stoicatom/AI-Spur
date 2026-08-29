/**
 * 场景 42 black-hole（singularity · 吞噬黑洞，1850ms）。
 *
 * 元素清单与签名取自设计规格 §4.2 场景 42；
 * 完整 CG 实现见计划 B（当前为桩：保持注册可用，渲染回退 legacy）。
 */
import { registerScene } from '../cg-scene-registry';
import type { CgStage, CgStageContext } from '../cg-scene';

export function createBlackHoleStage(_ctx: CgStageContext): CgStage {
  // 桩实现：计划 B 中按 config.elements 逐元素补齐渲染层与多元素互动。
  return {
    update() {},
    dispose() {},
  };
}

registerScene(
  {
    packId: 'black-hole',
    title: '吞噬黑洞',
    elements: ['事件视界', '吸积盘', '被吞噬尘埃', '引力透镜', '双极相对论喷流', '背景星场', '吸积温度渐变', '临界闪现', '尾声白炽'],
    signature: '唯一"引力主场"（全屏被弯曲）；吞噬+喷流回弹循环（唯一有"物质回弹"的吸积机制）',
    preset: 'singularity',
  },
  createBlackHoleStage,
);
