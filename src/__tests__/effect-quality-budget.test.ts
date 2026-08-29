import { describe, it, expect } from 'vitest';
import { budgetFor, QUALITY_TIERS } from '../overlay/effect-quality-budget';

describe('budgetFor', () => {
  it('四个手动档位的粒子乘数与 pixelRatio 上限符合规格 §3.1', () => {
    expect(budgetFor('cinematic')).toMatchObject({ particleScale: 1.0, maxPixelRatio: 2.0 });
    expect(budgetFor('high')).toMatchObject({ particleScale: 0.75, maxPixelRatio: 1.75 });
    expect(budgetFor('medium')).toMatchObject({ particleScale: 0.5, maxPixelRatio: 1.5 });
    expect(budgetFor('low')).toMatchObject({ particleScale: 0.3, maxPixelRatio: 1.25 });
  });

  it('后处理与体积层随档位递减', () => {
    expect(budgetFor('cinematic')).toMatchObject({ ssao: true, godrays: true, bloom: true });
    // 高档：上帝光开，SSAO 关。
    expect(budgetFor('high')).toMatchObject({ ssao: false, godrays: true, bloom: true });
    expect(budgetFor('medium')).toMatchObject({ ssao: false, godrays: false, bloom: true });
    expect(budgetFor('low')).toMatchObject({ ssao: false, godrays: false, bloom: false });
  });

  it('刚体预算：电影/高全量，中减半，低为零', () => {
    expect(budgetFor('cinematic').rigidBodyScale).toBe(1);
    expect(budgetFor('high').rigidBodyScale).toBe(1);
    expect(budgetFor('medium').rigidBodyScale).toBe(0.5);
    expect(budgetFor('low').rigidBodyScale).toBe(0);
  });

  it('SMAA 在所有档位都开（低档也要抗锯齿）', () => {
    for (const q of QUALITY_TIERS) {
      expect(budgetFor(q).smaa, q).toBe(true);
    }
  });

  it('auto 解析为 medium 兜底（真实档位由自适应器决定）', () => {
    expect(budgetFor('auto')).toEqual(budgetFor('medium'));
  });

  it('QUALITY_TIERS 由高到低排列，供自适应升降档步进', () => {
    expect(QUALITY_TIERS).toEqual(['cinematic', 'high', 'medium', 'low']);
  });
});
