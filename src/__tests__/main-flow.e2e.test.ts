/**
 * Main flow integration test
 *
 * Covers the swing-based interaction model: the animation-mode decision
 * (`wantsFullAnimation`) and the swing detector that turns cursor samples into
 * crack triggers.
 */
import { describe, it, expect } from 'vitest';
import { wantsFullAnimation } from '../overlay/quick_whip';
import { SwingDetector, DEFAULT_SWING, type SwingParams } from '../overlay/swing';

// ── wantsFullAnimation Decision Tests ──────────────────────────────────────

describe('wantsFullAnimation decision logic', () => {
  it('returns true for standard mode', () => {
    expect(wantsFullAnimation('standard', 0, 20, false)).toBe(true);
  });

  it('returns false for fast mode', () => {
    expect(wantsFullAnimation('fast', 0, 20, false)).toBe(false);
  });

  it('returns true for auto mode below threshold', () => {
    expect(wantsFullAnimation('auto', 5, 20, false)).toBe(true);
  });

  it('returns false for auto mode above threshold', () => {
    expect(wantsFullAnimation('auto', 25, 20, false)).toBe(false);
  });

  it('forceFull overrides fast mode', () => {
    expect(wantsFullAnimation('fast', 0, 20, true)).toBe(true);
  });

  it('forceFull overrides auto mode above threshold', () => {
    expect(wantsFullAnimation('auto', 50, 20, true)).toBe(true);
  });
});

// ── Swing detector Tests ────────────────────────────────────────────────────

/** Drive a fast leftward move followed by a hard stop (snap-back). */
function feedSnap(det: SwingDetector, params: SwingParams, startT: number): boolean {
  let fired = false;
  // Accelerate right: big steps every 16ms.
  const xs = [0, 90, 190, 300, 300, 300];
  let t = startT;
  for (let i = 0; i < xs.length; i++) {
    // The stop (repeated 300) is the snap: high peak speed then abrupt halt.
    fired = det.push({ x: xs[i], y: 200, t }, params) || fired;
    t += 16;
  }
  return fired;
}

describe('SwingDetector', () => {
  const params = { ...DEFAULT_SWING, graceMs: 0, cooldownMs: 0 };

  it('does not fire on slow drift', () => {
    const det = new SwingDetector(0);
    let fired = false;
    for (let i = 0; i < 10; i++) {
      // 5px per 16ms ≈ 0.3 px/ms — well under threshold.
      fired = det.push({ x: i * 5, y: 100, t: i * 16 }, params) || fired;
    }
    expect(fired).toBe(false);
  });

  it('fires on a fast swing followed by a hard stop', () => {
    const det = new SwingDetector(0);
    expect(feedSnap(det, params, 0)).toBe(true);
  });

  it('respects the grace period after spawn', () => {
    const det = new SwingDetector(0);
    const graced = { ...DEFAULT_SWING, graceMs: 1000, cooldownMs: 0 };
    // Snap happens at t≈80ms, inside the 1000ms grace window → suppressed.
    expect(feedSnap(det, graced, 0)).toBe(false);
  });

  it('higher sensitivity lowers the speed needed to fire', () => {
    // A moderate swing (~1.0 px/ms peak) that sits between the two thresholds:
    // sensitivity 2.0 → threshold 0.7 (fires), sensitivity 0.5 → threshold 2.8
    // (ignored).
    const move = (det: SwingDetector, p: SwingParams) => {
      let fired = false;
      const xs = [0, 16, 34, 52, 52, 52];
      let t = 0;
      for (const x of xs) {
        fired = det.push({ x, y: 100, t }, p) || fired;
        t += 16;
      }
      return fired;
    };
    const low = move(new SwingDetector(0), { ...DEFAULT_SWING, graceMs: 0, cooldownMs: 0, minTravel: 20, sensitivity: 0.5 });
    const high = move(new SwingDetector(0), { ...DEFAULT_SWING, graceMs: 0, cooldownMs: 0, minTravel: 20, sensitivity: 2.0 });
    expect(high).toBe(true);
    expect(low).toBe(false);
  });

  it('enforces a cooldown between cracks', () => {
    const det = new SwingDetector(0);
    const cooled = { ...DEFAULT_SWING, graceMs: 0, cooldownMs: 500 };
    const first = feedSnap(det, cooled, 0);
    // Immediately snap again well within the 500ms cooldown.
    const second = feedSnap(det, cooled, 96);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
