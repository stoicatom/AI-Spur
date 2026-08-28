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
        <div className="radio-stack window-presence-options" role="radiogroup" aria-label="窗口入口策略">
          <label className={`radio-row${config.windowPresence === 'tray' ? ' radio-row--active' : ''}`}>
            <input
              type="radio"
              name="window-presence"
              className="radio-row__input"
              value="tray"
              checked={config.windowPresence === 'tray'}
              onChange={() => onPatch({ windowPresence: 'tray' })}
            />
            <span className="radio-row__body">
              <span className="radio-row__label">纯托盘</span>
              <span className="radio-row__desc">关闭设置窗口后只保留托盘入口，桌面更安静。</span>
            </span>
          </label>
          <label
            className={`radio-row${config.windowPresence === 'persistent' ? ' radio-row--active' : ''}`}
          >
            <input
              type="radio"
              name="window-presence"
              className="radio-row__input"
              value="persistent"
              checked={config.windowPresence === 'persistent'}
              onChange={() => onPatch({ windowPresence: 'persistent' })}
            />
            <span className="radio-row__body">
              <span className="radio-row__label">保持 Dock/任务栏入口</span>
              <span className="radio-row__desc">关闭窗口后仍保留桌面入口，方便从 Dock 或任务栏返回。</span>
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}
