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
          左键点击菜单栏图标打开本设置窗口；右键弹出菜单，可直达各设置面板。触发催促请使用全局快捷键。
        </p>
      </section>
    </div>
  );
}
