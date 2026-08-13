/**
 * Quick-mode whip mini-animation.
 *
 * Design: a small whip that spawns in a corner (wherever the mouse is when it
 * triggers), auto-cracks near the start, then fades and despawns. It is meant
 * to be fast and unobtrusive compared to the full-screen standard animation.
 *
 * This module is pure — every function derives its output from its inputs, so
 * the timing decisions (when to crack, when to finish) are unit-testable
 * without a canvas.
 */

export interface QuickWhipState {
  /** Time of spawn, ms. Everything else is derived from (now - setAt). */
  setAt: number;
  /** Corner anchor the whip stays near. */
  x: number;
  y: number;
}

/** Result of evaluating one frame of the quick whip. */
export interface QuickWhipFrame {
  /** Advance the whip one step with these inputs. */
  crack: boolean;
  /** True once the whip has spent its budget and should be removed. */
  done: boolean;
  /** 0..1 progress through the animation lifetime, for fade effects. */
  progress: number;
  /** Current tip offset from the anchor (px), for visual shake. */
  deflection: number;
}

/** Timing constants for the quick whip. */
export const QUICK_WHIP = {
  /** Total lifetime before despawn. */
  durationMs: 900,
  /** Crack fires once this far in. */
  crackAtMs: 180,
  /** Sine period of the tip oscillation (shorter = snappier). */
  wobblePeriodMs: 220,
  /** Peak horizontal deflection (px). */
  maxDeflection: 46,
} as const;

/** Create a quick whip at the given anchor. */
export function createQuickWhip(x: number, y: number, now: number): QuickWhipState {
  return { setAt: now, x, y };
}

/**
 * Evaluate the quick whip at `now`.
 *
 * Pure: same (state, now) always yields the same frame.
 */
export function quickWhipFrame(state: QuickWhipState, now: number): QuickWhipFrame {
  const elapsed = Math.max(0, now - state.setAt);
  const progress = Math.min(1, elapsed / QUICK_WHIP.durationMs);

  const crack = elapsed >= QUICK_WHIP.crackAtMs && state.setAt >= 0;
  const done = elapsed >= QUICK_WHIP.durationMs;

  // A sharp decaying oscillation: big at the start, quieting toward the end.
  const wave = Math.sin((elapsed % QUICK_WHIP.wobblePeriodMs) / QUICK_WHIP.wobblePeriodMs * Math.PI * 2);
  const decay = 1 - progress * 0.8;
  const deflection = crack ? wave * QUICK_WHIP.maxDeflection * decay : 0;

  return { crack, done, progress, deflection };
}


/**
 * Decide whether a trigger should play the standard full animation or the
 * quick corner one, mirroring the design spec's 双轨 mode rule:
 *
 * - 'standard' → always full
 * - 'fast'     → always quick
 * - 'auto'     → full until usageCount crosses the threshold, quick after
 *
 * `forceFull` is the Shift-easter-egg override that wins in every mode.
 */
export function wantsFullAnimation(
  mode: 'standard' | 'fast' | 'auto',
  usageCount: number,
  autoSwitchThreshold: number,
  forceFull: boolean
): boolean {
  if (forceFull) return true;
  if (mode === 'standard') return true;
  if (mode === 'fast') return false;
  return usageCount < autoSwitchThreshold;
}

/** Tuning for the quick (corner) whip — smaller, faster than the full one. */
export const QUICK_TUNING = {
  arcWidth: 90,
  arcHeight: 70,
  /** Seconds after spawn before the quick whip auto-despawns. */
  lifetimeMs: 700,
  /** Auto-crack fires once this far into the lifetime. */
  autoCrackAtMs: 200,
} as const;
