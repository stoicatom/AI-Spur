/**
 * 宏失败恢复面板测试
 *
 * 关键回归：macOS 上甩完鞭子前台往往已不是白名单终端 → Rust 安全门返回
 * SafetyGate → 宏必然失败 → 面板必然弹出。旧实现为了让面板可见而整个跳过
 * hide()，全屏透明窗口就此留屏（光标丢失的第二条路径）。
 * 面板本身只负责 UI 与恢复状态机；窗口副作用由调用方处理，所以这里锁死
 * 「面板可见性」这一信号的正确性 —— dismiss() 依赖它决定缩窗还是隐藏。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MacroFailurePanel } from '../overlay/macro-failure-panel';
import type { MacroFailedPayload } from '../shared/ipc';

const PANEL_HTML = `
  <div id="macro-status" role="alert" hidden>
    <div id="macro-status__message"></div>
    <div id="macro-status__actions">
      <button id="macro-status__settings" type="button" hidden>打开输入权限</button>
      <button id="macro-status__retry" type="button" hidden>重试</button>
      <button id="macro-status__close" type="button">关闭</button>
    </div>
  </div>`;

function failure(over: Partial<MacroFailedPayload> = {}): MacroFailedPayload {
  return {
    code: 'SafetyGate',
    message: '前台不是终端，已取消发送。',
    retryable: false,
    attemptId: 1,
    ...over,
  };
}

interface Built {
  panel: MacroFailurePanel;
  triggerMacro: ReturnType<typeof vi.fn>;
  openInputPermissions: ReturnType<typeof vi.fn>;
  onRetryDismiss: ReturnType<typeof vi.fn>;
}

function build(over: Partial<Built> = {}): Built {
  document.body.innerHTML = PANEL_HTML;
  const triggerMacro = over.triggerMacro ?? vi.fn(async () => {});
  const openInputPermissions = over.openInputPermissions ?? vi.fn(async () => {});
  const onRetryDismiss = over.onRetryDismiss ?? vi.fn(async () => {});
  const panel = new MacroFailurePanel({ triggerMacro, openInputPermissions, onRetryDismiss });
  return { panel, triggerMacro, openInputPermissions, onRetryDismiss };
}

const el = (id: string) => document.getElementById(id) as HTMLElement;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  document.body.innerHTML = '';
});

describe('MacroFailurePanel 可见性信号', () => {
  it('初始不可见', () => {
    const { panel } = build();
    expect(panel.isVisible).toBe(false);
  });

  it('SafetyGate 失败后面板可见 —— dismiss 据此改走缩窗而非留全屏', () => {
    const { panel } = build();
    const attemptId = panel.beginAttempt();
    expect(panel.show(failure({ attemptId }), 'event')).toBe(true);
    expect(panel.isVisible).toBe(true);
    expect(el('macro-status').hidden).toBe(false);
  });

  it('hide() 后可见性归假', () => {
    const { panel } = build();
    panel.show(failure({ attemptId: panel.beginAttempt() }), 'event');
    panel.hide();
    expect(panel.isVisible).toBe(false);
    expect(el('macro-status').hidden).toBe(true);
  });

  it('SafetyGate 不可重试：隐藏重试按钮', () => {
    const { panel } = build();
    panel.show(failure({ attemptId: panel.beginAttempt(), retryable: false }), 'event');
    expect((el('macro-status__retry') as HTMLButtonElement).hidden).toBe(true);
  });

  it('仅 Permission 失败才露出权限入口', () => {
    const { panel } = build();
    panel.show(
      failure({ attemptId: panel.beginAttempt(), code: 'Permission', retryable: true }),
      'event',
    );
    expect((el('macro-status__settings') as HTMLButtonElement).hidden).toBe(false);
    expect((el('macro-status__retry') as HTMLButtonElement).hidden).toBe(false);
  });
});

describe('MacroFailurePanel 过期事件', () => {
  it('上一次 crack 的失败事件不得覆盖新一次尝试', () => {
    const { panel } = build();
    panel.beginAttempt(); // 1
    panel.beginAttempt(); // 2
    expect(panel.show(failure({ attemptId: 1 }), 'event')).toBe(false);
    expect(panel.isVisible).toBe(false);
  });

  it('结构化事件先到时，invoke 回退不再重复展示', () => {
    const { panel } = build();
    const attemptId = panel.beginAttempt();
    expect(panel.show(failure({ attemptId }), 'event')).toBe(true);
    panel.hide();
    expect(panel.showInvokeFailure(new Error('generic'), attemptId)).toBe(false);
    expect(panel.isVisible).toBe(false);
  });
});

describe('MacroFailurePanel.showInvokeFailure 分类', () => {
  it('权限类文案归为 Permission 且可重试', () => {
    const { panel } = build();
    panel.showInvokeFailure(new Error('accessibility 权限未授予'), panel.beginAttempt());
    expect(el('macro-status').dataset.code).toBe('Permission');
    expect((el('macro-status__settings') as HTMLButtonElement).hidden).toBe(false);
  });

  it('安全门文案归为 SafetyGate 且不可重试', () => {
    const { panel } = build();
    panel.showInvokeFailure(new Error('前台不是终端'), panel.beginAttempt());
    expect(el('macro-status').dataset.code).toBe('SafetyGate');
    expect((el('macro-status__retry') as HTMLButtonElement).hidden).toBe(true);
  });

  it('其他错误归为 SendFailure', () => {
    const { panel } = build();
    panel.showInvokeFailure(new Error('enigo backend exploded'), panel.beginAttempt());
    expect(el('macro-status').dataset.code).toBe('SendFailure');
  });
});

describe('MacroFailurePanel 重试与关闭', () => {
  it('重试成功后收起覆盖层', async () => {
    const { panel, triggerMacro, onRetryDismiss } = build();
    panel.show(failure({ attemptId: panel.beginAttempt(), retryable: true }), 'event');
    el('macro-status__retry').click();
    await vi.waitFor(() => expect(onRetryDismiss).toHaveBeenCalled());
    expect(triggerMacro).toHaveBeenCalled();
    expect(panel.isVisible).toBe(false);
  });

  it('重试再次失败时面板保持可见并记录日志（不静默吞错）', async () => {
    const triggerMacro = vi.fn(async () => {
      throw new Error('still not a terminal 前台');
    });
    const { panel, onRetryDismiss } = build({ triggerMacro });
    panel.show(failure({ attemptId: panel.beginAttempt(), retryable: true }), 'event');
    el('macro-status__retry').click();
    await vi.waitFor(() => expect(panel.isVisible).toBe(true));
    expect(onRetryDismiss).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('关闭按钮收起覆盖层 —— 面板不可见后 dismiss 才会走整窗隐藏', async () => {
    const { panel, onRetryDismiss } = build();
    panel.show(failure({ attemptId: panel.beginAttempt() }), 'event');
    el('macro-status__close').click();
    expect(panel.isVisible).toBe(false);
    await vi.waitFor(() => expect(onRetryDismiss).toHaveBeenCalled());
  });

  it('打开权限设置失败时展示错误而非静默', async () => {
    const openInputPermissions = vi.fn(async () => {
      throw new Error('cannot open pane');
    });
    const { panel } = build({ openInputPermissions });
    panel.show(
      failure({ attemptId: panel.beginAttempt(), code: 'Permission', retryable: true }),
      'event',
    );
    panel.hide();
    el('macro-status__settings').click();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });
});
