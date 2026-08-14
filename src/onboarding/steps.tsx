import { useEffect, useState } from 'react';
import { listSkins } from '../shared/ipc';
import type { SkinManifest } from '../shared/skins';
import { HotkeyRecorder } from '../settings/components/HotkeyRecorder';
import { formatAccel } from '../settings/hotkey';

/** The default phrases offered as checkboxes in step 2. */
export const SUGGESTED_PHRASES = [
  'FASTER',
  'KEEP GOING',
  "DON'T STOP NOW",
  'SHOW ME WHAT YOU GOT',
] as const;

// ── Step 1: hotkey ──────────────────────────────────────────────────────────

export interface StepHotkeyProps {
  hotkey: string;
  onHotkeyChange: (hotkey: string) => void;
}

export function StepHotkey({ hotkey, onHotkeyChange }: StepHotkeyProps) {
  return (
    <div className="onboard-step">
      <h2 className="onboard-step__title font-display">设置全局快捷键</h2>
      <p className="onboard-step__lead">有时候 Claude Code 实在太慢了。催它一下。</p>
      <HotkeyRecorder value={hotkey} onChange={onHotkeyChange} />
      <p className="field-hint">
        推荐 <span className="font-mono">{formatAccel('CommandOrControl+Shift+W')}</span>
        。冲突时会给出替代方案。
      </p>
    </div>
  );
}

// ── Step 2: phrases ─────────────────────────────────────────────────────────

export interface StepPhrasesProps {
  selected: string[];
  onToggle: (phrase: string) => void;
}

export function StepPhrases({ selected, onToggle }: StepPhrasesProps) {
  // The config schema requires at least one phrase, so the last one sticks.
  const isLast = (phrase: string) => selected.length === 1 && selected.includes(phrase);

  return (
    <div className="onboard-step">
      <h2 className="onboard-step__title font-display">选择提示词</h2>
      <p className="onboard-step__lead">每次甩动触发会随机发送一条。之后可以随时增删改。</p>

      <div className="onboard-phrases">
        {SUGGESTED_PHRASES.map((phrase) => {
          const checked = selected.includes(phrase);
          return (
            <label
              key={phrase}
              className={`toggle-row${checked ? ' radio-row--active' : ''}`}
            >
              <input
                type="checkbox"
                className="toggle-row__input"
                checked={checked}
                disabled={isLast(phrase)}
                onChange={() => onToggle(phrase)}
              />
              <span className="toggle-row__body">
                <span className="toggle-row__label font-mono">{phrase}</span>
              </span>
            </label>
          );
        })}
      </div>

      {selected.length === 1 && (
        <p className="field-hint field-hint--warning">至少保留一条提示词。</p>
      )}
    </div>
  );
}

// ── Step 3: skin + how it works ─────────────────────────────────────────────

export interface StepSkinProps {
  activeSkin: string;
  onSkinChange: (skinId: string) => void;
  hotkey: string;
  threshold: number;
}

export function StepSkin({ activeSkin, onSkinChange, hotkey, threshold }: StepSkinProps) {
  const [skins, setSkins] = useState<SkinManifest[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSkins()
      .then((list) => {
        if (!cancelled) setSkins(list);
      })
      .catch(() => {
        // Skin choice is optional here — the default skin already applies, so a
        // failed list should not block finishing onboarding.
        if (!cancelled) setSkins([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="onboard-step">
      <h2 className="onboard-step__title font-display">选择皮肤，然后开始</h2>

      {skins === null && <p className="field-hint">正在读取皮肤…</p>}

      {skins !== null && skins.length > 0 && (
        <div className="onboard-skins" role="radiogroup" aria-label="初始皮肤">
          {skins.map((skin) => (
            <button
              key={skin.id}
              type="button"
              role="radio"
              aria-checked={skin.id === activeSkin}
              className={`skin-card${skin.id === activeSkin ? ' skin-card--active' : ''}`}
              onClick={() => onSkinChange(skin.id)}
            >
              <span
                className="skin-card__swatch"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(135deg, ${skin.visuals.bodyGradient[0]}, ${skin.visuals.bodyGradient[1]})`,
                }}
              />
              <span className="skin-card__name font-display">{skin.name}</span>
            </button>
          ))}
        </div>
      )}

      <ol className="onboard-howto">
        <li>
          按 <span className="font-mono">{formatAccel(hotkey)}</span> 唤出覆盖层
        </li>
        <li>快速甩动鼠标，甩到位即触发（也可直接点击）</li>
        <li>自动发送中断信号 + 一条提示词</li>
      </ol>

      <p className="callout callout--info">
        前 {threshold} 次播放完整动画，之后自动切换快速模式。任何时候按住{' '}
        <span className="font-mono">Shift</span> + 快捷键都能看完整动画。
      </p>
    </div>
  );
}
