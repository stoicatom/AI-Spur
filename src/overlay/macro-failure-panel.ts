/**
 * 宏失败恢复面板：DOM、恢复状态机、重试入口。
 *
 * 从 main.ts 抽出，避免入口文件越过行数上限。面板自身只管 UI 与重试循环；
 * 「光标交还系统」「缩窗 / 拉回窗口」这些窗口级副作用由调用方在
 * `show()` 返回 true 后处理（见 main.ts 的 onPanelShown）。
 */

import { MacroRecoveryState } from './macro-recovery';
import type { MacroFailedPayload } from '../shared/ipc';

export type MacroFailureSource = 'event' | 'fallback';

export interface MacroFailurePanelDeps {
  triggerMacro(phrase?: string, attemptId?: number): Promise<void>;
  openInputPermissions(): Promise<void>;
  /** 重试成功 / 关闭面板后收起覆盖层。 */
  onRetryDismiss(): Promise<void>;
}

export class MacroFailurePanel {
  private visible = false;
  private readonly status = document.getElementById('macro-status') as HTMLElement | null;
  private readonly message = document.getElementById('macro-status__message') as HTMLElement | null;
  private readonly retry = document.getElementById('macro-status__retry') as HTMLButtonElement | null;
  private readonly settings = document.getElementById('macro-status__settings') as HTMLButtonElement | null;
  private readonly close = document.getElementById('macro-status__close') as HTMLButtonElement | null;
  private readonly recovery = new MacroRecoveryState();

  constructor(private readonly deps: MacroFailurePanelDeps) {
    this.retry?.addEventListener('click', () => void this.retryMacro());
    this.close?.addEventListener('click', () => {
      this.hide();
      void this.deps.onRetryDismiss();
    });
    this.settings?.addEventListener('click', () => {
      this.deps.openInputPermissions()
        .then(() => this.deps.onRetryDismiss())
        .catch((error: unknown) => {
          console.error('[overlay] open settings failed:', error);
          this.showInvokeFailure(error, this.latestAttempt);
        });
    });
    if (this.settings && /Windows/i.test(navigator.userAgent)) {
      this.settings.textContent = '查看 Windows 诊断';
    }
  }

  get isVisible(): boolean {
    return this.visible;
  }

  get latestAttempt(): number {
    return this.recovery.latestAttempt;
  }

  /** 新一次发送尝试：推进恢复状态机的 attemptId。 */
  beginAttempt(): number {
    return this.recovery.beginAttempt();
  }

  hide(): void {
    this.visible = false;
    if (this.status) this.status.hidden = true;
  }

  /** 展示失败面板。返回 false 表示过期事件被拒绝，调用侧不要做窗口副作用。 */
  show(failure: MacroFailedPayload, source: MacroFailureSource): boolean {
    // 上一次 crack 的失败事件可能在用户重试之后才到：绝不能覆盖当前恢复状态。
    const accepted = source === 'event'
      ? this.recovery.acceptEvent(failure.attemptId)
      : this.recovery.shouldShowFallback(failure.attemptId);
    if (!accepted) return false;
    if (!this.status || !this.message) return false;
    this.visible = true;
    this.status.dataset.code = failure.code;
    this.message.textContent = failure.message;
    if (this.retry) this.retry.hidden = !failure.retryable;
    if (this.settings) this.settings.hidden = failure.code !== 'Permission';
    this.status.hidden = false;
    return true;
  }

  /**
   * invoke 拒绝路径的分类与展示。结构化事件若先到，这里会被
   * MacroRecoveryState 拒绝，事件分类与权限动作保持权威。
   */
  showInvokeFailure(error: unknown, attemptId: number): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLocaleLowerCase();
    const code: MacroFailedPayload['code'] =
      /permission|accessibility|权限|辅助功能|输入权限/.test(normalized)
        ? 'Permission'
        : /safety|terminal|前台|终端|安全/.test(normalized)
          ? 'SafetyGate'
          : 'SendFailure';
    return this.show({
      code,
      message: message || '宏发送失败，请确认终端仍处于可输入状态后重试。',
      retryable: code !== 'SafetyGate',
      attemptId,
    }, 'fallback');
  }

  private async retryMacro(): Promise<void> {
    this.hide();
    const attemptId = this.beginAttempt();
    try {
      await this.deps.triggerMacro(undefined, attemptId);
      await this.deps.onRetryDismiss();
    } catch (error) {
      console.error('[overlay] macro retry failed:', error);
      // 事件优先；这个可见回退覆盖启动 / 监听竞态下 invoke 先拒绝的情况。
      this.showInvokeFailure(error, attemptId);
    }
  }
}
