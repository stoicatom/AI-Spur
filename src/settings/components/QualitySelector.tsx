import { useRef, useState, type KeyboardEvent } from 'react';
import type { EffectQuality } from '../../shared/config';
import { QUALITY_TIERS } from './quality-tiers';
import { nextRadioIndex } from './radio-nav';

interface QualitySelectorProps {
  value: EffectQuality;
  onChange: (quality: EffectQuality) => void;
}

/**
 * 特效画质五档选择器 —— 炉火节流阀（forge throttle）。
 *
 * 不做 SaaS 分段控件：五个凹槽共用一条导轨，每槽一列递增的炉火刻度，
 * 选中槽顶边燃起灯丝并铺一层余温底色，"档位高低"因此先于文字被读到。
 * `auto` 排在最前并换成自适应菱形，因为它是一条策略而不是阶梯上的一级。
 *
 * 档位说明放在导轨下方的读数条里，而不是塞进每个凹槽：设置面板内容区
 * 在默认窗口下只有 ~630px，五份说明并排会挤成断行的碎片。
 *
 * 无障碍：按钮伪装的 radiogroup + roving tabindex，方向键 / Home / End
 * 换档（与素材库单选组共用 `nextRadioIndex`）；每个按钮用 aria-label
 * 带上说明，读屏用户不依赖读数条也能听全。
 */
export function QualitySelector({ value, onChange }: QualitySelectorProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  // 当前档位不在列表里时（配置被外部改脏）退回第一项，保证始终有 tab 落点。
  const activeIndex = QUALITY_TIERS.findIndex((tier) => tier.id === value);
  const [rovingIndex, setRovingIndex] = useState(activeIndex);
  const tabbableIndex = activeIndex >= 0 ? activeIndex : Math.max(rovingIndex, 0);
  const readout = QUALITY_TIERS[activeIndex] ?? QUALITY_TIERS[0];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextRadioIndex(event.key, index, QUALITY_TIERS.length);
    if (nextIndex === null) return;

    event.preventDefault();
    setRovingIndex(nextIndex);
    onChange(QUALITY_TIERS[nextIndex].id);
    refs.current[nextIndex]?.focus();
  }

  return (
    <div className="quality-throttle">
      <div className="quality-throttle__rail" role="radiogroup" aria-label="特效画质">
        {QUALITY_TIERS.map((tier, index) => {
          const isActive = tier.id === value;
          return (
            <button
              key={tier.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${tier.label} — ${tier.desc}`}
              tabIndex={index === tabbableIndex ? 0 : -1}
              ref={(node) => {
                refs.current[index] = node;
              }}
              className={`quality-notch${isActive ? ' quality-notch--active' : ''}`}
              onClick={() => {
                setRovingIndex(index);
                onChange(tier.id);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span className="quality-notch__filament" aria-hidden="true" />
              <span className="quality-notch__gauge" aria-hidden="true">
                {tier.rungs === 0 ? (
                  <span className="quality-notch__auto-mark" />
                ) : (
                  Array.from({ length: 4 }, (_, rung) => (
                    <span
                      key={rung}
                      className={`quality-notch__rung${
                        rung < tier.rungs ? ' quality-notch__rung--lit' : ''
                      }`}
                    />
                  ))
                )}
              </span>
              <span className="quality-notch__name font-display">{tier.label}</span>
            </button>
          );
        })}
      </div>

      <p className="quality-readout" aria-live="polite">
        <span className="quality-readout__tier font-mono">{readout.label}</span>
        <span className="quality-readout__desc">{readout.desc}</span>
      </p>
    </div>
  );
}
