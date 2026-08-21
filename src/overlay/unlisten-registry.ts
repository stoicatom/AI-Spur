export type Unlisten = () => void;

/** Owns async Tauri subscriptions, including handles that resolve after teardown. */
export class UnlistenRegistry {
  private readonly active = new Set<Unlisten>();
  private disposed = false;

  track(registration: Promise<Unlisten>, label: string): void {
    void registration
      .then((unlisten) => {
        if (this.disposed) {
          this.release(unlisten);
          return;
        }
        this.active.add(unlisten);
      })
      .catch((error: unknown) => {
        if (!this.disposed) console.warn(`[overlay] ${label} subscription failed`, error);
      });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unlisten of this.active) this.release(unlisten);
    this.active.clear();
  }

  private release(unlisten: Unlisten): void {
    try { unlisten(); } catch {}
  }
}
