import type { AnimationMode } from '../../shared/config';
import type { PanelProps } from './panel-props';

interface ModeOption {
  value: AnimationMode;
  label: string;
  desc: string;
}

const MODES: ModeOption[] = [
  { value: 'standard', label: '标准模式', desc: '每次都播放完整动画，推荐新用户' },
  { value: 'fast', label: '快速模式', desc: '角落小动画，追求效率' },
  { value: 'auto', label: '自动切换', desc: '前 N 次标准，之后自动转快速' },
];

export function AnimationPanel({ config, onPatch }: PanelProps) {
  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">动画模式</h2>

        <div className="radio-stack" role="radiogroup" aria-label="动画模式">
          {MODES.map((mode) => {
            const isActive = config.animationMode === mode.value;
            return (
              <label
                key={mode.value}
                className={`radio-row${isActive ? ' radio-row--active' : ''}`}
              >
                <input
                  type="radio"
                  name="animation-mode"
                  className="radio-row__input"
                  value={mode.value}
                  checked={isActive}
                  onChange={() => onPatch({ animationMode: mode.value })}
                />
                <span className="radio-row__body">
                  <span className="radio-row__label">{mode.label}</span>
                  <span className="radio-row__desc">{mode.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {config.animationMode === 'auto' && (
        <section className="field">
          <h2 className="field__label" id="threshold-label">
            切换阈值
          </h2>
          <p className="field__desc">达到该次数后自动切换为快速模式。</p>
          <div className="threshold-row">
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={config.autoSwitchThreshold}
              aria-labelledby="threshold-label"
              className="range"
              onChange={(e) => onPatch({ autoSwitchThreshold: Number(e.target.value) })}
            />
            <output className="threshold-row__value font-mono">
              {config.autoSwitchThreshold} 次
            </output>
          </div>
        </section>
      )}

      <section className="field">
        <h2 className="field__label" id="sensitivity-label">crack 灵敏度</h2>
        <p className="field__desc">
          甩动要多快才会触发 crack？调高更容易触发，调低需要更用力的甩动。
        </p>
        <div className="threshold-row">
          <input
            type="range"
            min={0.5}
            max={2.0}
            step={0.1}
            value={config.crackSensitivity}
            aria-labelledby="sensitivity-label"
            className="range"
            onChange={(e) => onPatch({ crackSensitivity: Number(e.target.value) })}
          />
          <output className="threshold-row__value font-mono">
            {Math.round(config.crackSensitivity * 100)}%
          </output>
        </div>
      </section>

      <section className="field">
        <p className="callout callout--info">
          任何模式下按住 <span className="font-mono">Shift</span> + 快捷键，都会强制播放完整动画。
        </p>
      </section>
    </div>
  );
}
