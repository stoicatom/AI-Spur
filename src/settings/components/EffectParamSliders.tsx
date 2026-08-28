import type { CSSProperties } from 'react';
import { effectParamDefs, effectParamDefaults } from './effect-params';

interface Props {
  presetId: string;
  values: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}

/**
 * 特效参数微调滑块组。
 *
 * 每个预设的可调键、区间与默认值都来自 `effect-params-data.ts`（内置 pack.json
 * + overlay 引擎 clamp），所以这里不含任何魔法数字：只负责渲染与回填。
 *
 * 轨道用 accent 渐变把「已选比例」画出来（--fill 由当前值算出），比裸 range
 * 更容易看出参数偏离默认多远。
 */
export function EffectParamSliders({ presetId, values, onChange }: Props) {
  const defs = effectParamDefs(presetId);
  if (defs.length === 0) return null;

  const isDefault = defs.every((def) => values[def.key] === def.fallback);

  return (
    <div className="param-tuner" role="group" aria-label="特效参数微调">
      <div className="param-tuner__head">
        <span className="param-tuner__title">参数微调</span>
        <button
          type="button"
          className="param-tuner__reset"
          disabled={isDefault}
          onClick={() => onChange(effectParamDefaults(presetId))}
        >
          重置为预设默认
        </button>
      </div>
      <div className="param-tuner__grid">
        {defs.map((def) => {
          const value = values[def.key] ?? def.fallback;
          const fill = ((value - def.min) / (def.max - def.min)) * 100;
          return (
            <label key={def.key} className="param-slider">
              <span className="param-slider__label">{def.label}</span>
              <span className="param-slider__value font-mono">{formatValue(value, def.step)}</span>
              <input
                type="range"
                className="param-slider__input"
                aria-label={def.label}
                min={def.min}
                max={def.max}
                step={def.step}
                value={value}
                style={{ '--fill': `${fill}%` } as CSSProperties}
                onChange={(event) =>
                  onChange({ ...values, [def.key]: Number(event.target.value) })
                }
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** 步进决定小数位：整数步进显示整数，0.05 显示两位，避免 1.9000000000000001。 */
function formatValue(value: number, step: number): string {
  if (Number.isInteger(step)) return String(Math.round(value));
  const digits = step < 0.05 ? 2 : Math.min(2, String(step).split('.')[1]?.length ?? 2);
  return value.toFixed(digits);
}
