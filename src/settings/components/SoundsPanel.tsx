import type { PanelProps } from './panel-props';

export function SoundsPanel({ config, onPatch }: PanelProps) {
  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">音效与反馈</h2>

        <label className="toggle-row">
          <input
            type="checkbox"
            className="toggle-row__input"
            checked={config.playSound}
            onChange={(e) => onPatch({ playSound: e.target.checked })}
          />
          <span className="toggle-row__body">
            <span className="toggle-row__label">播放 crack 音效</span>
            <span className="toggle-row__desc">从当前皮肤的音效集中随机选取。</span>
          </span>
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            className="toggle-row__input"
            checked={config.showBorderFlash}
            onChange={(e) => onPatch({ showBorderFlash: e.target.checked })}
          />
          <span className="toggle-row__body">
            <span className="toggle-row__label">屏幕边缘闪光</span>
            <span className="toggle-row__desc">crack 时屏幕边缘出现一次短暂高亮。</span>
          </span>
        </label>
      </section>
    </div>
  );
}
