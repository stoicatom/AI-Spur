import { describe, it, expect } from 'vitest';
import {
  wantsFullAnimation,
  quickWhipFrame,
  createQuickWhip,
  QUICK_WHIP,
} from '../overlay/quick_whip';

describe('wantsFullAnimation (FR-03 double-track mode rule)', () => {
  it('standard mode always plays the full animation', () => {
    expect(wantsFullAnimation('standard', 0, 20, false)).toBe(true);
    expect(wantsFullAnimation('standard', 999, 20, false)).toBe(true);
  });

  it('fast mode always plays the quick one', () => {
    expect(wantsFullAnimation('fast', 0, 20, false)).toBe(false);
    expect(wantsFullAnimation('fast', 999, 20, false)).toBe(false);
  });

  it('auto mode uses the full animation below the threshold', () => {
    expect(wantsFullAnimation('auto', 0, 20, false)).toBe(true);
    expect(wantsFullAnimation('auto', 19, 20, false)).toBe(true);
  });

  it('auto mode switches to quick once the threshold is crossed', () => {
    expect(wantsFullAnimation('auto', 20, 20, false)).toBe(false);
    expect(wantsFullAnimation('auto', 100, 20, false)).toBe(false);
  });

  it('forceFull overrides every mode including fast and post-threshold auto', () => {
    expect(wantsFullAnimation('fast', 0, 20, true)).toBe(true);
    expect(wantsFullAnimation('auto', 999, 20, true)).toBe(true);
    // and it does not force-lose for standard (already full)
    expect(wantsFullAnimation('standard', 0, 20, true)).toBe(true);
  });
});

describe('quickWhipFrame', () => {
  const T0 = 1000;
  const state = createQuickWhip(50, 60, T0);

  it('is not done and not cracking at spawn', () => {
    const f = quickWhipFrame(state, T0);
    expect(f.done).toBe(false);
    expect(f.crack).toBe(false);
    expect(f.progress).toBe(0);
  });

  it('cracks once past the crackAt point', () => {
    const at = T0 + QUICK_WHIP.crackAtMs;
    const f = quickWhipFrame(state, at);
    expect(f.crack).toBe(true);
  });

  it('finishes once past the duration', () => {
    const at = T0 + QUICK_WHIP.durationMs;
    const f = quickWhipFrame(state, at);
    expect(f.done).toBe(true);
    expect(f.progress).toBe(1);
  });

  it('progress is clamped to [0, 1]', () => {
    expect(quickWhipFrame(state, T0 - 500).progress).toBe(0);
    expect(quickWhipFrame(state, T0 + 5000).progress).toBe(1);
  });

  it('is a pure function: same inputs give the same outputs', () => {
    const a = quickWhipFrame(state, T0 + 400);
    const b = quickWhipFrame(state, T0 + 400);
    expect(a).toEqual(b);
  });
});
