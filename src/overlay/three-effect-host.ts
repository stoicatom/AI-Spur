import type { ThreeEffectRenderer, ThreeEffectSpec } from './three-effects';

/** Isolates optional WebGL loading and failure recovery from the overlay loop. */
export class ThreeEffectHost {
  private renderer: ThreeEffectRenderer | null = null;
  private initialization: Promise<void> | null = null;
  private disposed = false;
  /** A lost context cannot accept new GPU work until the browser restores it. */
  private contextLost = false;
  private initializationGeneration = 0;
  private recoveryGeneration = 0;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement | null) {
    canvas?.addEventListener('webglcontextlost', this.onContextLost);
    canvas?.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  get isAlive(): boolean { return this.renderer?.isAlive ?? false; }

  ensure(): void {
    if (!this.canvas || this.renderer || this.initialization || this.disposed || this.contextLost) return;
    const canvas = this.canvas;
    const generation = ++this.initializationGeneration;
    this.initialization = import('./three-effects')
      .then(({ ThreeEffectRenderer: Renderer }) => {
        if (this.disposed || this.contextLost || generation !== this.initializationGeneration) return;
        const renderer = new Renderer(canvas);
        try {
          if (this.disposed || this.contextLost || generation !== this.initializationGeneration) {
            renderer.dispose();
            return;
          }
          renderer.resize(this.width, this.height);
          this.renderer = renderer;
        } catch (error) {
          // Do not retain a renderer whose first projection update failed.
          renderer.dispose();
          throw error;
        }
      })
      .catch((error: unknown) => console.warn('[overlay] WebGL unavailable, using 2D fallback', error))
      .finally(() => {
        if (generation === this.initializationGeneration) this.initialization = null;
      });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.contextLost || !this.renderer) return;
    try {
      this.renderer.resize(width, height);
    } catch (error) {
      console.warn('[overlay] WebGL resize failed, using 2D fallback', error);
      this.releaseRenderer();
      this.ensure();
    }
  }

  start(spec: ThreeEffectSpec): boolean {
    const renderer = this.renderer;
    if (!renderer || this.contextLost) {
      this.ensure();
      return false;
    }
    try {
      renderer.start(spec);
      return true;
    } catch (error) {
      console.warn('[overlay] WebGL start failed, using 2D fallback', error);
      this.releaseRenderer();
      this.ensure();
      return false;
    }
  }

  update(now: number): boolean {
    if (this.contextLost || !this.renderer?.isAlive) return false;
    try {
      return this.renderer.update(now);
    } catch (error) {
      console.warn('[overlay] WebGL frame failed, resuming 2D fallback', error);
      this.releaseRenderer();
      this.ensure();
      return false;
    }
  }

  cancel(): void {
    try { this.renderer?.cancel(); } catch {}
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.initializationGeneration++;
    this.recoveryGeneration++;
    this.canvas?.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.releaseRenderer();
    this.initialization = null;
  }

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.recoveryGeneration++;
    this.cancel();
  };

  private readonly onContextRestored = (): void => {
    if (this.disposed) return;
    this.contextLost = false;
    const generation = ++this.recoveryGeneration;
    // The host listener is registered before WebGLRenderer's own recovery
    // listener. A microtask lets Three restore its internal GL state first.
    queueMicrotask(() => {
      if (this.disposed || this.contextLost || generation !== this.recoveryGeneration) return;
      try {
        if (this.renderer) this.renderer.resize(this.width, this.height);
        else this.ensure();
      } catch (error) {
        console.warn('[overlay] WebGL restore failed, using 2D fallback', error);
        this.releaseRenderer();
        this.ensure();
      }
    });
  };

  private releaseRenderer(): void {
    const renderer = this.renderer;
    this.renderer = null;
    try { renderer?.dispose(); } catch {}
  }
}
