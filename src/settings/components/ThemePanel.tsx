import { useState } from 'react';
import type { Theme } from '../../shared/config';

export interface ThemePanelProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

const THEME_OPTIONS: Array<{ value: Theme; label: string; desc: string }> = [
  { value: 'light', label: '浅色', desc: '始终使用浅色主题' },
  { value: 'dark', label: '深色', desc: '始终使用深色主题' },
  { value: 'auto', label: '自动', desc: '跟随系统外观设置' },
];

/**
 * Theme selection panel.
 *
 * Allows switching between light, dark, and auto (system preference) themes.
 * The setting is applied immediately via CSS [data-theme] attribute.
 */
export function ThemePanel({ theme, onChange }: ThemePanelProps) {
  const [localTheme, setLocalTheme] = useState(theme);

  function handleChange(newTheme: Theme) {
    setLocalTheme(newTheme);
    onChange(newTheme);

    // Apply immediately to the document root
    if (newTheme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  }

  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">外观模式</h2>
        <p className="field__desc">
          选择应用外观。自动模式将跟随系统设置切换浅色/深色主题。
        </p>
        <div className="radio-stack" role="radiogroup" aria-label="外观模式">
          {THEME_OPTIONS.map((option) => {
            const isActive = localTheme === option.value;
            return (
              <label
                key={option.value}
                className={`radio-row${isActive ? ' radio-row--active' : ''}`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={isActive}
                  onChange={() => handleChange(option.value)}
                  className="radio-row__input"
                />
                <span className="radio-row__content">
                  <span className="radio-row__label">{option.label}</span>
                  <span className="radio-row__desc">{option.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
