import { HotkeyRecorder } from './HotkeyRecorder';
import type { PanelProps } from './panel-props';

export function TriggerPanel({ config, onPatch }: PanelProps) {
  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">全局快捷键</h2>
        <p className="field__desc">
          在任何应用中按下该组合即可召唤鞭子。按住 Shift 可强制播放完整动画。
        </p>
        <HotkeyRecorder value={config.hotkey} onChange={(hotkey) => onPatch({ hotkey })} />
      </section>

      <section className="field">
        <h2 className="field__label">托盘触发</h2>
        <p className="field__desc">
          点击菜单栏的托盘图标同样可以触发，行为与快捷键一致。此入口始终可用。
        </p>
      </section>
    </div>
  );
}
