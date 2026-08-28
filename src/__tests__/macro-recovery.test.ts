import { describe, expect, it } from 'vitest';
import { MacroRecoveryState } from '../overlay/macro-recovery';

describe('MacroRecoveryState', () => {
  it('keeps a structured event authoritative when it arrives before invoke rejection', () => {
    const state = new MacroRecoveryState();
    const attempt = state.beginAttempt();

    expect(state.acceptEvent(attempt)).toBe(true);
    expect(state.shouldShowFallback(attempt)).toBe(false);
  });

  it('allows a fallback first, then lets the structured event refine it', () => {
    const state = new MacroRecoveryState();
    const attempt = state.beginAttempt();

    expect(state.shouldShowFallback(attempt)).toBe(true);
    expect(state.acceptEvent(attempt)).toBe(true);
  });

  it('drops failures from attempts older than the active retry', () => {
    const state = new MacroRecoveryState();
    const first = state.beginAttempt();
    state.beginAttempt();

    expect(state.acceptEvent(first)).toBe(false);
  });
});
