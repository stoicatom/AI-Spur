export type AudioCleanup = () => void;

/** 追踪存活的声音图表，确保隐藏覆盖层不会截断可听见的尾音。 */
export class AudioPlaybackRegistry {
  private readonly active = new Set<() => void>();
  private closeRequested = false;

  constructor(private readonly disposeContext: () => void) {}

  track(cleanup: AudioCleanup): () => void {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.active.delete(release);
      try {
        cleanup();
      } finally {
        this.disposeWhenIdle();
      }
    };
    this.active.add(release);
    return release;
  }

  /** 让当前图表自然结束，之后再释放共享上下文。 */
  releaseContextWhenIdle(): void {
    this.closeRequested = true;
    this.disposeWhenIdle();
  }

  /** 仅用于进程退出等不应继续播放尾音的场景。 */
  forceClose(): void {
    this.closeRequested = false;
    for (const release of [...this.active]) {
      try {
        release();
      } catch {
        // One failed graph cleanup must not keep the context alive.
      }
    }
    this.disposeContext();
  }

  private disposeWhenIdle(): void {
    if (!this.closeRequested || this.active.size > 0) return;
    this.closeRequested = false;
    this.disposeContext();
  }
}
