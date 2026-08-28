/**
 * 覆盖层渲染循环（原 main.ts 的 frame / startLoop / stopLoop）。
 *
 * 抽成独立模块的原因：结束判定异常路径多（WebGL 回退、上下文丢失、crackAlive
 * 提前变假），任何一条绕过 `if (material.crackAlive)` 就会 rAF 空转、窗口永久
 * 留屏。循环自带特效超时看门狗 —— 从 `armWatchdog` 起算，到点无条件走
 * `onDismiss`，不依赖任何渲染状态。
 */

import type { ThreeEffectHost } from './three-effect-host';
import type { ImageMaterial } from './image-material';
import type { MaterialTrail } from './material-trail';
import { EffectWatchdog, watchdogTimeoutFor } from './effect-watchdog';

export interface OverlayRenderLoopDeps {
  ctx: CanvasRenderingContext2D;
  three: ThreeEffectHost;
  material: ImageMaterial;
  trail: MaterialTrail;
  width(): number;
  height(): number;
  mouseX(): number;
  mouseY(): number;
  /** frame() 的静默绘制分支只在覆盖层激活时进入。 */
  isActive(): boolean;
  onDismiss(): Promise<void>;
}

export class OverlayRenderLoop {
  private readonly watchdog: EffectWatchdog;
  private rafId = 0;

  constructor(private readonly deps: OverlayRenderLoopDeps) {
    this.watchdog = new EffectWatchdog(() => {
      void this.deps.onDismiss();
    });
  }

  start(): void {
    if (this.rafId === 0) this.rafId = requestAnimationFrame(this.frame);
  }

  /** 立即停帧并清屏；同时解除看门狗（能走到这里说明结束路径已正常触发）。 */
  stop(): void {
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.watchdog.disarm();
    this.deps.ctx.clearRect(0, 0, this.deps.width(), this.deps.height());
  }

  /** 从特效标称时长推导强制收起时限；重复调用只保留最后一个定时器。 */
  armWatchdog(effectDurationMs: number): void {
    this.watchdog.arm(watchdogTimeoutFor(effectDurationMs));
  }

  private readonly frame = (): void => {
    const { deps } = this;
    const { ctx, three, material, trail } = deps;
    ctx.clearRect(0, 0, deps.width(), deps.height());
    const now = performance.now();

    if (material.crackAlive) {
      let ended = false;
      if (three.isAlive) ended = three.update(now);
      if (!three.isAlive) material.updateAndDrawCrack(ctx, now);
      if (ended || (!three.isAlive && !material.crackAlive)) {
        void deps.onDismiss();
        return;
      }
    } else if (deps.isActive()) {
      trail.draw(ctx, now);
      material.drawCursor(ctx, deps.mouseX(), deps.mouseY());
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
