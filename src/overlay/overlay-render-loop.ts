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

/** 一帧落笔范围的包围盒（覆盖层逻辑像素坐标）。 */
interface DirtyRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class OverlayRenderLoop {
  private readonly watchdog: EffectWatchdog;
  private rafId = 0;
  /** 上一帧的脏区域；下一帧清除时取并集，避免光标移动后留下残影。 */
  private previousDirty: DirtyRect | null = null;

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
    // 全屏已清空，累积的脏区域随之失效；留着会让下一次显示的首帧
    // 去并集一个上一次会话的矩形（白清一片，或更糟：漏清真正要清的地方）。
    this.previousDirty = null;
  }

  /** 从特效标称时长推导强制收起时限；重复调用只保留最后一个定时器。 */
  armWatchdog(effectDurationMs: number): void {
    this.watchdog.arm(watchdogTimeoutFor(effectDurationMs));
  }

  private readonly frame = (): void => {
    const { deps } = this;
    const { ctx, three, material, trail } = deps;
    const now = performance.now();

    if (material.crackAlive) {
      // Crack 阶段：粒子/WebGL 特效可能铺满整屏，只能全屏清除。
      ctx.clearRect(0, 0, deps.width(), deps.height());
      // 脏区域记录在这一帧失效（整屏已清空），否则回到跟随阶段时会拿一个
      // 过期矩形去取并集。
      this.previousDirty = null;
      let ended = false;
      if (three.isAlive) ended = three.update(now);
      if (!three.isAlive) material.updateAndDrawCrack(ctx, now);
      if (ended || (!three.isAlive && !material.crackAlive)) {
        void deps.onDismiss();
        return;
      }
    } else if (deps.isActive()) {
      // 非 crack 阶段：画面上只有拖尾 + 光标精灵，按真实包围盒做脏区域清除
      // （R-PERF-002）。全屏 clearRect 在 5K Retina 上要清 ~1500 万物理像素，
      // 而这两个东西合起来通常只占屏幕的百分之几。
      const mx = deps.mouseX();
      const my = deps.mouseY();
      const radius = material.cursorDrawRadius;
      // 本帧要落笔的范围：光标精灵 + 拖尾自己报告的包围盒（按线宽外扩）。
      let minX = mx - radius;
      let minY = my - radius;
      let maxX = mx + radius;
      let maxY = my + radius;
      const trailBounds = trail.bounds();
      if (trailBounds) {
        const pad = trail.maxLineWidth;
        if (trailBounds.minX - pad < minX) minX = trailBounds.minX - pad;
        if (trailBounds.minY - pad < minY) minY = trailBounds.minY - pad;
        if (trailBounds.maxX + pad > maxX) maxX = trailBounds.maxX + pad;
        if (trailBounds.maxY + pad > maxY) maxY = trailBounds.maxY + pad;
      }
      // 与上一帧的脏区域取并集后再清：光标在两帧之间已经移动，只清本帧范围
      // 会把上一帧画在旧位置的像素留在屏幕上（残影）。
      const previous = this.previousDirty;
      const clearMinX = previous ? Math.min(minX, previous.minX) : minX;
      const clearMinY = previous ? Math.min(minY, previous.minY) : minY;
      const clearMaxX = previous ? Math.max(maxX, previous.maxX) : maxX;
      const clearMaxY = previous ? Math.max(maxY, previous.maxY) : maxY;
      this.previousDirty = { minX, minY, maxX, maxY };

      const x = Math.max(0, Math.floor(clearMinX));
      const y = Math.max(0, Math.floor(clearMinY));
      const right = Math.min(deps.width(), Math.ceil(clearMaxX));
      const bottom = Math.min(deps.height(), Math.ceil(clearMaxY));
      if (right > x && bottom > y) ctx.clearRect(x, y, right - x, bottom - y);

      trail.draw(ctx, now);
      material.drawCursor(ctx, mx, my);
    }

    this.rafId = requestAnimationFrame(this.frame);
  };
}
