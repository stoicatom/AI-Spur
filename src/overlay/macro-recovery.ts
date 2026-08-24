export type MacroFailureSource = 'event' | 'fallback';

/**
 * Orders structured macro failures against invoke rejections.
 * Tauri events and invoke promises are independent channels, so the overlay
 * must keep this state outside the DOM rendering path.
 */
export class MacroRecoveryState {
  private latest = 0;
  private readonly sources = new Map<number, MacroFailureSource>();

  get latestAttempt(): number {
    return this.latest;
  }

  beginAttempt(): number {
    this.latest += 1;
    for (const attemptId of this.sources.keys()) {
      if (attemptId < this.latest - 2) this.sources.delete(attemptId);
    }
    return this.latest;
  }

  acceptEvent(attemptId: number): boolean {
    if (attemptId < this.latest) return false;
    this.latest = Math.max(this.latest, attemptId);
    this.sources.set(attemptId, 'event');
    return true;
  }

  shouldShowFallback(attemptId: number): boolean {
    if (this.sources.get(attemptId) === 'event') return false;
    this.sources.set(attemptId, 'fallback');
    return true;
  }
}
