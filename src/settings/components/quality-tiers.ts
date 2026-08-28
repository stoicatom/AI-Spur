import type { EffectQuality } from '../../shared/config';

/**
 * 特效画质档位的展示数据（设计规格 §3.1）。
 *
 * `rungs` = 视觉上的"炉火刻度"格数：越高的档位点亮越多格，
 * 让档位方向在读到文字之前就能被扫到。`auto` 不在这条阶梯上
 * （它是一条策略，不是一级台阶），因此 rungs 为 0，改用自适应菱形标记。
 */
export interface QualityTier {
  id: EffectQuality;
  label: string;
  desc: string;
  rungs: number;
}

export const QUALITY_TIERS: QualityTier[] = [
  { id: 'auto', label: '自动', desc: '实测帧耗时自适应升降档，最流畅优先', rungs: 0 },
  { id: 'cinematic', label: '电影级', desc: '全后处理链 + 体积光 + 全量刚体', rungs: 4 },
  { id: 'high', label: '高', desc: '体积光保留，关闭 SSAO', rungs: 3 },
  { id: 'medium', label: '中', desc: 'Bloom + 抗锯齿，刚体减半', rungs: 2 },
  { id: 'low', label: '低', desc: '仅抗锯齿，适合核显与远程桌面', rungs: 1 },
];
