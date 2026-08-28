/**
 * 覆盖层窗口控制器：隐藏 / 宏失败缩窗 / 还原。
 *
 * 背景：宏发送失败（如前台不是白名单终端 → SafetyGate）时，`dismiss()` 为
 * 了保住 `#macro-status` 恢复面板而整个跳过 hide()，全屏透明窗口留在屏上。
 * 正确做法是缩窗而非留全屏：把窗口缩到只包住恢复面板，同时摘掉光标作用域。
 *
 * 注意：`shrunkPanelRect` 只在「原窗口所在显示器」内定位面板，不跨屏重排。
 * 多屏定位 / 显示器变更属于 Rust 侧 `overlay_placement` 的职责 ——
 * 缩窗只写回原窗口自身的几何，后续 show 前的放置逻辑仍是 Rust 说了算。
 */

import { getCurrentWindow, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';

/** 缩窗后恢复面板的逻辑尺寸（后续按 scaleFactor 换算成物理像素）。 */
export const RECOVERY_PANEL_LOGICAL = { width: 300, height: 110 } as const;
/** 面板下边缘与全屏窗口底边的视觉留白（逻辑像素）。 */
export const RECOVERY_PANEL_BOTTOM_GAP = 48;

export interface OverlayWindowHandle {
  hide(): Promise<void>;
  show(): Promise<void>;
  scaleFactor(): Promise<number>;
  outerSize(): Promise<{ width: number; height: number }>;
  outerPosition(): Promise<{ x: number; y: number }>;
  setSize(size: { width: number; height: number }): Promise<void>;
  setPosition(position: { x: number; y: number }): Promise<void>;
}

export interface PhysicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 在原全屏窗口的边界框内，求恢复面板的物理矩形。 */
export function shrunkPanelRect(full: PhysicalRect, scale: number): PhysicalRect {
  const width = Math.min(RECOVERY_PANEL_LOGICAL.width * scale, full.width);
  const height = Math.min(RECOVERY_PANEL_LOGICAL.height * scale, full.height);
  return {
    width,
    height,
    x: full.x + Math.round((full.width - width) / 2),
    y: Math.max(full.y, full.y + full.height - height - RECOVERY_PANEL_BOTTOM_GAP * scale),
  };
}

type WinLoader = () => Promise<OverlayWindowHandle>;

/** 把 Tauri 的 Window 适配成本模块的最小句柄（尺寸/位置统一走物理像素）。 */
const PRODUCTION_LOADER: WinLoader = async () => {
  const win = getCurrentWindow();
  return {
    hide: () => win.hide(),
    show: () => win.show(),
    scaleFactor: () => win.scaleFactor(),
    outerSize: async () => {
      const size = await win.outerSize();
      return { width: size.width, height: size.height };
    },
    outerPosition: async () => {
      const position = await win.outerPosition();
      return { x: position.x, y: position.y };
    },
    setSize: (size) => win.setSize(new PhysicalSize(size.width, size.height)),
    setPosition: (position) => win.setPosition(new PhysicalPosition(position.x, position.y)),
  };
};

export class OverlayWindowController {
  private fullRect: PhysicalRect | null = null;
  private handle: OverlayWindowHandle | null = null;

  constructor(private readonly loadWindow: WinLoader = PRODUCTION_LOADER) {}

  get isShrunk(): boolean {
    return this.fullRect !== null;
  }

  private async acquire(): Promise<OverlayWindowHandle> {
    if (!this.handle) this.handle = await this.loadWindow();
    return this.handle;
  }

  /**
   * 隐藏窗口。先还原全屏几何（否则下次 show 出来的是个小窗），
   * 隐藏失败先重试一次，仍失败则记录日志 —— 绝不静默吞掉。
   */
  async hide(): Promise<boolean> {
    await this.restoreFullscreen();
    return this.mutate('hide', (w) => w.hide());
  }

  /** 让窗口重新可见（宏失败事件晚到、窗口已隐藏时用）。 */
  async show(): Promise<boolean> {
    return this.mutate('show', (w) => w.show());
  }

  /** 宏失败：缩成只包住恢复面板的小窗；失败自动还原并记录。 */
  async shrinkToRecoveryPanel(): Promise<boolean> {
    const win = await this.acquire().catch((error: unknown) => {
      console.error('[overlay] window unavailable, cannot shrink to recovery panel:', error);
      return null;
    });
    if (!win) return false;
    if (this.fullRect) return true; // 已缩窗，勿把小窗几何覆盖记录

    let geometry: { size: { width: number; height: number }; position: { x: number; y: number }; scale: number };
    try {
      const [size, position, scale] = await Promise.all([
        win.outerSize(),
        win.outerPosition(),
        win.scaleFactor(),
      ]);
      geometry = { size, position, scale };
    } catch (error) {
      console.error('[overlay] cannot read overlay geometry for recovery panel:', error);
      return false;
    }

    this.fullRect = {
      x: geometry.position.x,
      y: geometry.position.y,
      width: geometry.size.width,
      height: geometry.size.height,
    };

    const target = shrunkPanelRect(this.fullRect, geometry.scale);
    try {
      await win.setSize({ width: target.width, height: target.height });
      await win.setPosition({ x: target.x, y: target.y });
      return true;
    } catch (error) {
      console.error('[overlay] shrink to recovery panel failed:', error);
      await this.restoreFullscreen().catch(() => {});
      // 还原本身也可能失败（往往是同一个 setPosition 在报错）。此时几何已
      // 不可信，绝不能留着记录让调用方以为「还处于缩窗、待还原」——
      // 调用方会退回整窗隐藏，下一次 show 前的放置由 Rust 侧重新决定。
      this.fullRect = null;
      return false;
    }
  }

  /** 还原成全屏；缩窗失败后调用，或在下一次 show 前调用。 */
  async restoreFullscreen(): Promise<boolean> {
    if (!this.fullRect) return false;
    const rect = this.fullRect;
    try {
      const win = await this.acquire();
      await win.setSize({ width: rect.width, height: rect.height });
      await win.setPosition({ x: rect.x, y: rect.y });
      this.fullRect = null;
      return true;
    } catch (error) {
      console.error('[overlay] restore overlay geometry failed:', error);
      return false;
    }
  }

  private async mutate(label: string, op: (w: OverlayWindowHandle) => Promise<void>): Promise<boolean> {
    try {
      const win = await this.acquire();
      try {
        await op(win);
        return true;
      } catch (first) {
        console.error(`[overlay] window ${label} failed (attempt 1):`, first);
        await op(win);
        return true;
      }
    } catch (error) {
      console.error(`[overlay] window ${label} failed after retry:`, error);
      return false;
    }
  }
}
