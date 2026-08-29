import { describe, it, expect } from 'vitest';
import { budgetFor, QUALITY_TIERS } from '../overlay/effect-quality-budget';
import { clampPixelRatioToBudget } from '../overlay/effect-quality-wiring';

describe('档位 pixelRatio 封顶（规格 §3.1）', () => {
  it('硬件比高于档位上限时被档位封顶', () => {
    expect(clampPixelRatioToBudget(2.0, budgetFor('low'))).toBe(1.25);
    expect(clampPixelRatioToBudget(2.0, budgetFor('medium'))).toBe(1.5);
  });

  it('硬件比低于档位上限时保留硬件值，不上调', () => {
    expect(clampPixelRatioToBudget(1.0, budgetFor('cinematic'))).toBe(1.0);
  });

  it('每个档位的封顶结果不超过该档位声明的上限', () => {
    for (const tier of QUALITY_TIERS) {
      const budget = budgetFor(tier);
      expect(clampPixelRatioToBudget(4, budget)).toBe(budget.maxPixelRatio);
    }
  });

  it('档位越低封顶越严', () => {
    const ratios = QUALITY_TIERS.map((t) => clampPixelRatioToBudget(4, budgetFor(t)));
    expect(ratios).toEqual([...ratios].sort((a, b) => b - a));
  });
});
