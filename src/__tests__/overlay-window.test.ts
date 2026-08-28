/**
 * 覆盖层窗口收起 / 缩窗测试
 *
 * 两条留窗路径：
 *  1. `dismiss()` 里裸 `catch {}` 吞掉 hide() 失败 → 全屏窗口留屏且无日志；
 *  2. 宏失败时为了让恢复面板可见而整个跳过 hide() → 全屏窗口留屏。
 * 这里把窗口操作抽成可注入的适配器，逐条覆盖失败路径。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OverlayWindowController,
  shrunkPanelRect,
  RECOVERY_PANEL_LOGICAL,
  RECOVERY_PANEL_BOTTOM_GAP,
  type OverlayWindowHandle,
  type PhysicalRect,
} from '../overlay/overlay-window';

function fakeHandle(overrides: Partial<OverlayWindowHandle> = {}): OverlayWindowHandle {
  return {
    hide: vi.fn(async () => {}),
    show: vi.fn(async () => {}),
    scaleFactor: vi.fn(async () => 2),
    outerSize: vi.fn(async () => ({ width: 3456, height: 2160 })),
    outerPosition: vi.fn(async () => ({ x: 0, y: 0 })),
    setSize: vi.fn(async () => {}),
    setPosition: vi.fn(async () => {}),
    ...overrides,
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('shrunkPanelRect', () => {
  const full: PhysicalRect = { x: 100, y: 50, width: 2000, height: 1200 };

  it('在原窗口所在显示器内水平居中', () => {
    const rect = shrunkPanelRect(full, 1);
    expect(rect.width).toBe(RECOVERY_PANEL_LOGICAL.width);
    expect(rect.x).toBe(100 + Math.round((2000 - RECOVERY_PANEL_LOGICAL.width) / 2));
  });

  it('贴近原窗口底部，保留视觉留白', () => {
    const rect = shrunkPanelRect(full, 1);
    expect(rect.y).toBe(50 + 1200 - RECOVERY_PANEL_LOGICAL.height - RECOVERY_PANEL_BOTTOM_GAP);
  });

  it('按缩放因子换算物理像素（Retina / 多屏不同 DPI）', () => {
    const rect = shrunkPanelRect(full, 2);
    expect(rect.width).toBe(RECOVERY_PANEL_LOGICAL.width * 2);
    expect(rect.height).toBe(RECOVERY_PANEL_LOGICAL.height * 2);
  });

  it('窗口比面板还小时不产生负尺寸/越界坐标', () => {
    const tiny: PhysicalRect = { x: 10, y: 10, width: 100, height: 60 };
    const rect = shrunkPanelRect(tiny, 1);
    expect(rect.width).toBeLessThanOrEqual(tiny.width);
    expect(rect.height).toBeLessThanOrEqual(tiny.height);
    expect(rect.x).toBeGreaterThanOrEqual(tiny.x);
    expect(rect.y).toBeGreaterThanOrEqual(tiny.y);
  });
});

describe('OverlayWindowController.hide', () => {
  it('正常路径调用一次 hide', async () => {
    const handle = fakeHandle();
    const ctrl = new OverlayWindowController(async () => handle);
    await ctrl.hide();
    expect(handle.hide).toHaveBeenCalledTimes(1);
  });

  it('首次 hide 失败时重试一次（不再静默吞错）', async () => {
    const hide = vi
      .fn(async () => {})
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    const handle = fakeHandle({ hide });
    const ctrl = new OverlayWindowController(async () => handle);
    await ctrl.hide();
    expect(hide).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('两次都失败时记录错误并返回 false，绝不抛出', async () => {
    const handle = fakeHandle({ hide: vi.fn(async () => { throw new Error('boom'); }) });
    const ctrl = new OverlayWindowController(async () => handle);
    await expect(ctrl.hide()).resolves.toBe(false);
    expect(handle.hide).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('窗口模块导入失败时记录错误而非静默', async () => {
    const ctrl = new OverlayWindowController(async () => {
      throw new Error('no tauri');
    });
    await expect(ctrl.hide()).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('OverlayWindowController 缩窗 / 还原', () => {
  it('缩窗前记录全屏几何，缩窗后设置面板尺寸', async () => {
    const handle = fakeHandle();
    const ctrl = new OverlayWindowController(async () => handle);
    await expect(ctrl.shrinkToRecoveryPanel()).resolves.toBe(true);
    expect(handle.setSize).toHaveBeenCalledTimes(1);
    expect(handle.setPosition).toHaveBeenCalledTimes(1);
    expect(ctrl.isShrunk).toBe(true);
  });

  it('还原时把记录下来的全屏几何原样写回（不重算显示器）', async () => {
    const handle = fakeHandle({
      outerSize: vi.fn(async () => ({ width: 2560, height: 1440 })),
      outerPosition: vi.fn(async () => ({ x: -2560, y: 120 })),
    });
    const ctrl = new OverlayWindowController(async () => handle);
    await ctrl.shrinkToRecoveryPanel();
    await ctrl.restoreFullscreen();
    const restoreSize = vi.mocked(handle.setSize).mock.calls.at(-1)?.[0];
    const restorePos = vi.mocked(handle.setPosition).mock.calls.at(-1)?.[0];
    expect(restoreSize).toEqual({ width: 2560, height: 1440 });
    expect(restorePos).toEqual({ x: -2560, y: 120 });
    expect(ctrl.isShrunk).toBe(false);
  });

  it('缩窗中途失败会自动还原，绝不留下半缩状态', async () => {
    const handle = fakeHandle({
      setPosition: vi.fn(async () => { throw new Error('placement denied'); }),
    });
    const ctrl = new OverlayWindowController(async () => handle);
    await expect(ctrl.shrinkToRecoveryPanel()).resolves.toBe(false);
    expect(ctrl.isShrunk).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('缩窗失败时调用方可退回整窗隐藏', async () => {
    const handle = fakeHandle({
      outerSize: vi.fn(async () => { throw new Error('unavailable'); }),
    });
    const ctrl = new OverlayWindowController(async () => handle);
    expect(await ctrl.shrinkToRecoveryPanel()).toBe(false);
    expect(await ctrl.hide()).toBe(true);
    expect(handle.hide).toHaveBeenCalledTimes(1);
  });

  it('未缩窗时还原是空操作', async () => {
    const handle = fakeHandle();
    const ctrl = new OverlayWindowController(async () => handle);
    await ctrl.restoreFullscreen();
    expect(handle.setSize).not.toHaveBeenCalled();
  });

  it('隐藏时会先还原几何，避免下次 show 出现小窗', async () => {
    const handle = fakeHandle();
    const ctrl = new OverlayWindowController(async () => handle);
    await ctrl.shrinkToRecoveryPanel();
    await ctrl.hide();
    expect(ctrl.isShrunk).toBe(false);
    // 还原（第 2 次）发生在 hide 之前
    expect(vi.mocked(handle.setSize).mock.invocationCallOrder[1])
      .toBeLessThan(vi.mocked(handle.hide).mock.invocationCallOrder[0]);
  });

  it('重复缩窗不会把小窗几何当成全屏几何记录下来', async () => {
    const handle = fakeHandle();
    const ctrl = new OverlayWindowController(async () => handle);
    await ctrl.shrinkToRecoveryPanel();
    await ctrl.shrinkToRecoveryPanel();
    await ctrl.restoreFullscreen();
    expect(vi.mocked(handle.setSize).mock.calls.at(-1)?.[0])
      .toEqual({ width: 3456, height: 2160 });
  });
});
