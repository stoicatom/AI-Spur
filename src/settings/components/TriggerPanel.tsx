import { HotkeyRecorder } from './HotkeyRecorder';
import type { PanelProps } from './panel-props';

export function TriggerPanel({ config, onPatch }: PanelProps) {
  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">全局快捷键</h2>
        <p className="field__desc">
          在任何应用中按下该组合即可唤出覆盖层，甩动鼠标触发。再次按下可收起。按住 Shift 强制完整动画。
        </p>
        <HotkeyRecorder value={config.hotkey} onChange={(hotkey) => onPatch({ hotkey })} />
      </section>

      <section className="field">
        <h2 className="field__label">托盘图标</h2>
        <p className="field__desc">
          从托盘、Dock 或任务栏打开本设置窗口；托盘右键可直达各设置面板。触发催促请使用全局快捷键。
        </p>
      </section>

      <section className="field">
        <h2 className="field__label">窗口入口</h2>
        <p className="field__desc">
          选择关闭设置窗口后的恢复方式。纯托盘模式更安静；保持窗口入口会保留 Dock/任务栏入口。
        </p>
        <label className="select-field">
          <span className="sr-only">窗口入口策略</span>
          <select
            className="input"
            value={config.windowPresence}
            onChange={(event) =>
              onPatch({ windowPresence: event.target.value as PanelProps['config']['windowPresence'] })
            }
          >
            <option value="tray">纯托盘</option>
            <option value="persistent">保持 Dock/任务栏入口</option>
          </select>
        </label>
      </section>
    </div>
  );
}
