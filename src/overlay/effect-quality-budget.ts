/**
 * 画质档位 → 渲染预算表（设计规格 §3.1）。
 *
 * 一份档位定义同时约束：渲染分辨率、后处理 pass 列表、粒子上限、
 * 刚体数量、全屏场 shader 迭代。所有消费方读这里，避免各处散落魔数。
 *
 * 档位是画质目标，不承诺任何 fps 数值——自适应逻辑（§3.2）用本机
 * 运行时基准做相对判断，不在此文件写绝对阈值。
 */
import type { EffectQuality } from '../shared/config';

/** 手动档位，由高到低。自适应升降档按此顺序步进，两端封顶不外溢。 */
export const QUALITY_TIERS = ['cinematic', 'high', 'medium', 'low'] as const;

/** 手动档位（不含 auto）。 */
export type QualityTier = (typeof QUALITY_TIERS)[number];

/** 一个档位的完整渲染预算。 */
export type EffectBudget = {
  /** 粒子数量乘数，作用于每个 emitter 的上限。 */
  particleScale: number;
  /** 设备像素比上限，交给 pixelRatioFor 再与硬件能力取小。 */
  maxPixelRatio: number;
  /** 刚体数量乘数，0 表示不启用物理层。 */
  rigidBodyScale: number;
  bloom: boolean;
  /** 体积光（GodRays）。 */
  godrays: boolean;
  ssao: boolean;
  /** 色散（chromatic aberration）。 */
  dispersion: boolean;
  /** 胶片颗粒。 */
  grain: boolean;
  vignette: boolean;
  /** LUT 色彩分级。 */
  lut: boolean;
  /** 抗锯齿：所有档位都开，低端机同样需要边缘质量。 */
  smaa: boolean;
};

const BUDGETS: Record<QualityTier, EffectBudget> = {
  cinematic: {
    particleScale: 1.0, maxPixelRatio: 2.0, rigidBodyScale: 1,
    bloom: true, godrays: true, ssao: true,
    dispersion: true, grain: true, vignette: true, lut: true, smaa: true,
  },
  high: {
    particleScale: 0.75, maxPixelRatio: 1.75, rigidBodyScale: 1,
    bloom: true, godrays: true, ssao: false,
    dispersion: true, grain: true, vignette: false, lut: false, smaa: true,
  },
  medium: {
    particleScale: 0.5, maxPixelRatio: 1.5, rigidBodyScale: 0.5,
    bloom: true, godrays: false, ssao: false,
    dispersion: false, grain: false, vignette: false, lut: false, smaa: true,
  },
  low: {
    particleScale: 0.3, maxPixelRatio: 1.25, rigidBodyScale: 0,
    bloom: false, godrays: false, ssao: false,
    dispersion: false, grain: false, vignette: false, lut: false, smaa: true,
  },
};

/**
 * 取一个档位的渲染预算。
 *
 * `auto` 返回 medium 作为兜底：真实档位由自适应器（§3.2）探测后
 * 解析成具体 tier 再传进来，此处只保证任何输入都有可用预算。
 */
export function budgetFor(quality: EffectQuality): EffectBudget {
  if (quality === 'auto') return BUDGETS.medium;
  return BUDGETS[quality];
}
