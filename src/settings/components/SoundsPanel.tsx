import type { PanelProps } from './panel-props';

export function SoundsPanel({ config, onPatch }: PanelProps) {
  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">音效与反馈</h2>
        <p className="field__desc">
          crack 音效已与素材包强绑定——在「素材包」面板切换素材即同步更换音色（程序化合成，零音频文件）。此处仅控制全局开关与视觉反馈。
        </p>

        <label className="toggle-row">
          <input type="checkbox" className="toggle-row__input"
            checked={config.playSound}
            onChange={(e) => onPatch({ playSound: e.target.checked })} />
          <span className="toggle-row__body">
            <span className="toggle-row__label">播放程序化音效</span>
            <span className="toggle-row__desc">每次 crack 时播放素材包专属多层音色（Web Audio 合成）。</span>
          </span>
        </label>

        <label className="toggle-row">
          <input type="checkbox" className="toggle-row__input"
            checked={config.showBorderFlash}
            onChange={(e) => onPatch({ showBorderFlash: e.target.checked })} />
          <span className="toggle-row__body">
            <span className="toggle-row__label">屏幕边缘闪光</span>
            <span className="toggle-row__desc">crack 时屏幕边缘出现一次短暂高亮。</span>
          </span>
        </label>
      </section>
    </div>
  );
}
