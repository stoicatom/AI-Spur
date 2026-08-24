import { useState, type CSSProperties } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { createCustomPack, readLocalSoundData } from '../../shared/ipc';
import type { MaterialPack } from '../../shared/material-packs';
import { EFFECT_PRESET_IDS } from '../../shared/material-packs';
import { ACCENT_COLORS, PRESET_META, SOUND_UPLOAD_HINT } from './wizard-data';
import { EffectIcon } from './EffectIcon';
import { Icon } from './Icon';

interface Props {
  onCreated: (pack: MaterialPack) => void;
  onClose: () => void;
}

type WizardStep = 0 | 1 | 2;
const STEP_LABELS = ['图标', '声音', '特效'];

/** 新建素材包：图标 + 真实录音 + 3D 运动预设。 */
export function CreatePackWizard({ onCreated, onClose }: Props) {
  const [step, setStep] = useState<WizardStep>(0);
  const [name, setName] = useState('');
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [soundPath, setSoundPath] = useState<string | null>(null);
  const [soundPreview, setSoundPreview] = useState<string | null>(null);
  const [accentIdx, setAccentIdx] = useState(0);
  const [presetId, setPresetId] = useState<string>('jet');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accent = ACCENT_COLORS[accentIdx];

  async function pickIcon() {
    const path = await open({ multiple: false, directory: false, filters: [{ name: '图标', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }] });
    if (typeof path === 'string') setIconPath(path);
  }

  async function pickSound() {
    const path = await open({ multiple: false, directory: false, filters: [{ name: '真实录音', extensions: ['wav', 'mp3', 'm4a', 'aac', 'ogg'] }] });
    if (typeof path !== 'string') return;
    try {
      setError(null);
      const preview = await readLocalSoundData(path);
      setSoundPath(path);
      setSoundPreview(preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function submit() {
    if (!iconPath || !soundPath || !name.trim()) { setError('请填写名称并选择图标与真实录音'); return; }
    setSubmitting(true);
    setError(null);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);
    try {
      const pack = await createCustomPack({
        id: `${slug}-${Date.now().toString(36)}`,
        name: name.trim(),
        iconPath,
        soundPath,
        effectPreset: presetId,
        sound: { layers: [], masterGain: 0.82 },
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
  const canNext1 = soundPath !== null;
  const isLast = step === 2;

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="新建素材包" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wizard-modal">
        <button type="button" className="wizard-close" aria-label="关闭" onClick={onClose}><Icon name="close" /></button>
        <h2 className="wizard-title font-display">新建素材包</h2>
        <div className="wizard-steps" role="list">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="wizard-step-item" role="listitem">
              <div className={`wizard-dot${i === step ? ' wizard-dot--active' : i < step ? ' wizard-dot--done' : ''}`}>{i < step ? <Icon name="check" /> : i + 1}</div>
              <span className={`wizard-step-label${i === step ? ' wizard-step-label--active' : ''}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <div className={`wizard-step-line${i < step ? ' wizard-step-line--done' : ''}`} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="wizard-body">
            <label className="wizard-field-label">名称</label>
            <input type="text" className="input" placeholder="我的素材" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            <label className="wizard-field-label" style={{ marginTop: '1rem' }}>高清图标</label>
            <button type="button" className={`icon-dropzone${iconPath ? ' icon-dropzone--selected' : ''}`} onClick={() => void pickIcon()}>
              {iconPath ? <><Icon name="check" /><span className="icon-dropzone__path">{iconPath.split(/[/\\]/).pop()}</span></> : <><Icon name="upload" /><span>选择 PNG / SVG / WebP</span></>}
            </button>
            <p className="field-hint">使用真实材质、棚拍光照和接触阴影的高清图标，避免卡通或 emoji。</p>
            <label className="wizard-field-label" style={{ marginTop: '1rem' }}>配色</label>
            <div className="accent-swatches" role="radiogroup" aria-label="配色方案">
              {ACCENT_COLORS.map((c, i) => <button key={c.label} type="button" role="radio" aria-checked={i === accentIdx} className={`accent-swatch${i === accentIdx ? ' accent-swatch--active' : ''}`} style={{ background: `linear-gradient(135deg,${c.c1},${c.c2})` } as CSSProperties} title={c.label} onClick={() => setAccentIdx(i)} />)}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <p className="wizard-field-label">真实录音 / Foley</p>
            <p className="field-hint">{SOUND_UPLOAD_HINT}</p>
            <button type="button" className={`icon-dropzone${soundPath ? ' icon-dropzone--selected' : ''}`} onClick={() => void pickSound()}>
              {soundPath ? <><Icon name="check" /><span className="icon-dropzone__path">{soundPath.split(/[/\\]/).pop()}</span></> : <><Icon name="upload" /><span>选择音频文件</span></>}
            </button>
            {soundPreview && <audio className="wizard-audio-preview" controls preload="metadata" src={soundPreview} aria-label="试听上传的真实录音" />}
            <p className="field-hint">播放总线会保留原始音色，仅做轻微响度匹配、立体声定位和防削波压缩。</p>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <p className="wizard-field-label">选择 3D CG 运动预设</p>
            <div className="effect-preset-grid" role="radiogroup" aria-label="运动轨迹特效">
              {EFFECT_PRESET_IDS.map((id) => {
                const meta = PRESET_META[id] ?? { icon: 'burst' as const, label: id };
                return <button key={id} type="button" role="radio" aria-checked={presetId === id} className={`effect-preset-tile${presetId === id ? ' effect-preset-tile--active' : ''}`} onClick={() => setPresetId(id)}><EffectIcon name={meta.icon} /><span className="effect-preset-tile__label font-mono">{meta.label}</span></button>;
              })}
            </div>
            <p className="field-hint">渲染器使用 ACES 色调映射、物理材质与稳定三点布光，透明叠加保持性能预算。</p>
          </div>
        )}

        {error && <p className="wizard-error font-mono">{error}</p>}
        <div className="wizard-nav">
          {step > 0 && <button type="button" className="btn btn--ghost" onClick={() => setStep((s) => (s - 1) as WizardStep)}><Icon name="chevron-left" /> 上一步</button>}
          <span style={{ flex: 1 }} />
          {!isLast ? <button type="button" className="btn btn--primary" disabled={(step === 0 && !canNext0) || (step === 1 && !canNext1)} onClick={() => setStep((s) => (s + 1) as WizardStep)}>下一步 <Icon name="chevron-right" /></button> : <button type="button" className="btn btn--primary" disabled={submitting} onClick={() => void submit()}>{submitting ? '创建中…' : '完成创建'}</button>}
        </div>
      </div>
    </div>
  );
}
