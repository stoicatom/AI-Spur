import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { createCustomPack } from '../../shared/ipc';
import type { MaterialPack } from '../../shared/material-packs';
import { EFFECT_PRESET_IDS } from '../../shared/material-packs';
import { SOUND_MOODS, ACCENT_COLORS, PRESET_META } from './wizard-data';

interface Props {
  onCreated: (pack: MaterialPack) => void;
  onClose: () => void;
}

type WizardStep = 0 | 1 | 2;

const STEP_LABELS = ['图标', '声音', '特效'];

/**
 * 新建素材包向导：3 步创建自定义素材包（图标 → 声音情绪 → 特效预设）。
 * 调用 createCustomPack IPC，Rust 端负责路径复制与 pack.json 写入。
 */
export function CreatePackWizard({ onCreated, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>(0);
  const [name, setName] = useState('');
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [accentIdx, setAccentIdx] = useState(0);
  const [soundId, setSoundId] = useState(SOUND_MOODS[0].id);
  const [presetId, setPresetId] = useState<string>('jet');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accent = ACCENT_COLORS[accentIdx];

  async function pickIcon() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: '图标', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
    });
    if (typeof path === 'string') setIconPath(path);
  }

  async function submit() {
    if (!iconPath || !name.trim()) { setError('请填写名称并选择图标'); return; }
    setSubmitting(true);
    setError(null);
    const mood = SOUND_MOODS.find((m) => m.id === soundId) ?? SOUND_MOODS[0];
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);
    try {
      const pack = await createCustomPack({
        id: `${slug}-${Date.now().toString(36)}`,
        name: name.trim(),
        iconPath,
        effectPreset: presetId,
        sound: mood.recipe,
        palette: { bodyGradient: [accent.c1, accent.c2], particleHue: accent.hue },
      });
      onCreated(pack);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canNext0 = name.trim().length > 0 && iconPath !== null;
  const canNext1 = soundId !== '';
  const isLast = step === 2;

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="新建素材包"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wizard-modal">
        <button type="button" className="wizard-close" aria-label="关闭" onClick={onClose}>×</button>

        <h2 className="wizard-title font-display">新建素材包</h2>

        {/* 步骤指示器 */}
        <div className="wizard-steps" role="list">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="wizard-step-item" role="listitem">
              <div className={`wizard-dot${i === step ? ' wizard-dot--active' : i < step ? ' wizard-dot--done' : ''}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`wizard-step-label${i === step ? ' wizard-step-label--active' : ''}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <div className={`wizard-step-line${i < step ? ' wizard-step-line--done' : ''}`} />}
            </div>
          ))}
        </div>

        {/* Step 0：图标 */}
        {step === 0 && (
          <div className="wizard-body">
            <label className="wizard-field-label">名称</label>
            <input type="text" className="input" placeholder="我的素材" value={name}
              onChange={(e) => setName(e.target.value)} maxLength={20} />
            <label className="wizard-field-label" style={{ marginTop: '1rem' }}>图标文件</label>
            <button type="button" className={`icon-dropzone${iconPath ? ' icon-dropzone--selected' : ''}`}
              onClick={() => void pickIcon()}>
              {iconPath ? (
                <><span className="icon-dropzone__check">✓</span><span className="icon-dropzone__path">{iconPath.split(/[/\\]/).pop()}</span></>
              ) : (
                <><span className="icon-dropzone__plus" aria-hidden="true">↑</span><span>点击选择 PNG / SVG / WebP</span></>
              )}
            </button>
            <label className="wizard-field-label" style={{ marginTop: '1rem' }}>配色</label>
            <div className="accent-swatches" role="radiogroup" aria-label="配色方案">
              {ACCENT_COLORS.map((c, i) => (
                <button key={c.label} type="button" role="radio" aria-checked={i === accentIdx}
                  className={`accent-swatch${i === accentIdx ? ' accent-swatch--active' : ''}`}
                  style={{ background: `linear-gradient(135deg,${c.c1},${c.c2})` } as React.CSSProperties}
                  title={c.label} onClick={() => setAccentIdx(i)} />
              ))}
            </div>
          </div>
        )}

        {/* Step 1：声音 */}
        {step === 1 && (
          <div className="wizard-body">
            <p className="wizard-field-label">选择音效风格</p>
            <div className="sound-mood-grid" role="radiogroup" aria-label="音效风格">
              {SOUND_MOODS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={soundId === m.id}
                  className={`sound-mood-card${soundId === m.id ? ' sound-mood-card--active' : ''}`}
                  onClick={() => setSoundId(m.id)}>
                  <span className="sound-mood-card__glyph" aria-hidden="true">{m.glyph}</span>
                  <span className="sound-mood-card__label font-display">{m.label}</span>
                  <span className="sound-mood-card__desc">{m.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2：特效 */}
        {step === 2 && (
          <div className="wizard-body">
            <p className="wizard-field-label">选择运动轨迹特效</p>
            <div className="effect-preset-grid" role="radiogroup" aria-label="运动轨迹特效">
              {EFFECT_PRESET_IDS.map((id) => {
                const meta = PRESET_META[id] ?? { glyph: '◆', label: id };
                return (
                  <button key={id} type="button" role="radio" aria-checked={presetId === id}
                    className={`effect-preset-tile${presetId === id ? ' effect-preset-tile--active' : ''}`}
                    onClick={() => setPresetId(id)}>
                    <span className="effect-preset-tile__glyph" aria-hidden="true">{meta.glyph}</span>
                    <span className="effect-preset-tile__label font-mono">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="wizard-error font-mono">{error}</p>}

        {/* 导航按钮 */}
        <div className="wizard-nav">
          {step > 0 && (
            <button type="button" className="btn btn--ghost" onClick={() => setStep((s) => (s - 1) as WizardStep)}>
              ← 上一步
            </button>
          )}
          <span style={{ flex: 1 }} />
          {!isLast ? (
            <button type="button" className="btn btn--primary"
              disabled={(step === 0 && !canNext0) || (step === 1 && !canNext1)}
              onClick={() => setStep((s) => (s + 1) as WizardStep)}>
              下一步 →
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={submitting} onClick={() => void submit()}>
              {submitting ? '创建中…' : '完成创建'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
