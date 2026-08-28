import { useState, type CSSProperties } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { createCustomPack, updateCustomPack, readLocalSoundData } from '../../shared/ipc';
import type { MaterialPack } from '../../shared/material-packs';
import { EFFECT_PRESET_IDS } from '../../shared/material-packs';
import { ACCENT_COLORS, PRESET_META, SOUND_UPLOAD_HINT, accentIndexForHue } from './wizard-data';
import { mergeEffectParams } from './effect-params';
import { EffectParamSliders } from './EffectParamSliders';
import { EffectIcon } from './EffectIcon';
import { Icon } from './Icon';

interface Props {
  /** 传入即进入编辑模式：字段预填、资产可不重选、提交走 update。 */
  editing?: MaterialPack;
  onSaved: (pack: MaterialPack) => void;
  onClose: () => void;
}

type WizardStep = 0 | 1 | 2;
const STEP_LABELS = ['图标', '声音', '特效'];

/** 素材包向导：新建（图标 + 真实录音 + 3D 运动预设）与编辑复用同一条流程。 */
export function CreatePackWizard({ editing, onSaved, onClose }: Props) {
  const isEdit = editing !== undefined;
  const [step, setStep] = useState<WizardStep>(0);
  const [name, setName] = useState(editing?.name ?? '');
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [soundPath, setSoundPath] = useState<string | null>(null);
  const [soundPreview, setSoundPreview] = useState<string | null>(null);
  const [accentIdx, setAccentIdx] = useState(() =>
    editing ? accentIndexForHue(editing.palette.particleHue) : 0,
  );
  const [presetId, setPresetId] = useState<string>(editing?.effect.preset ?? 'jet');
  const [params, setParams] = useState<Record<string, number>>(() =>
    mergeEffectParams(editing?.effect.preset ?? 'jet', editing?.effect.params),
  );
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

  /** 切换预设时把参数投影过去：同名键沿用，其余补新预设默认值。 */
  function choosePreset(id: string) {
    setPresetId(id);
    setParams((current) => mergeEffectParams(id, current));
  }

  async function submit() {
    if (!name.trim()) { setError('请填写素材包名称'); return; }
    if (!isEdit && (!iconPath || !soundPath)) { setError('请选择图标与真实录音'); return; }
    setSubmitting(true);
    setError(null);
    const palette = { bodyGradient: [accent.c1, accent.c2] as [string, string], particleHue: accent.hue };
    try {
      const pack = isEdit
        ? await updateCustomPack({
            id: editing.id,
            name: name.trim(),
            // 未重选时不传路径 —— Rust 据此沿用现有资产，一个字节都不碰。
            ...(iconPath ? { iconPath } : {}),
            ...(soundPath ? { soundPath } : {}),
            effectPreset: presetId,
            effectParams: params,
            palette,
          })
        : await createCustomPack({
            id: `${slugify(name)}-${Date.now().toString(36)}`,
            name: name.trim(),
            iconPath: iconPath as string,
            soundPath: soundPath as string,
            effectPreset: presetId,
            effectParams: params,
            sound: { layers: [], masterGain: 0.82 },
            palette,
          });
      onSaved(pack);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // 编辑模式下图标/音频已在包里，不强制重选。
  const canNext0 = name.trim().length > 0 && (isEdit || iconPath !== null);
  const canNext1 = isEdit || soundPath !== null;
  const isLast = step === 2;
  const title = isEdit ? '编辑素材包' : '新建素材包';

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wizard-modal">
        <button type="button" className="wizard-close" aria-label="关闭" onClick={onClose}><Icon name="close" /></button>
        <h2 className="wizard-title font-display">{title}</h2>
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
            <label className="wizard-field-label" htmlFor="wizard-name">名称</label>
            <input id="wizard-name" type="text" className="input" placeholder="我的素材" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
            {isEdit && (
              <p className="wizard-id-row">
                <span className="wizard-id-label">素材包 ID</span>
                <code className="wizard-id-value font-mono">{editing.id}</code>
                <span className="wizard-id-note">不可更改</span>
              </p>
            )}
            <label className="wizard-field-label" style={{ marginTop: '1rem' }}>高清图标</label>
            {isEdit && !iconPath && (
              <div className="asset-current">
                <img className="asset-current__thumb" src={editing.dataUri} alt="当前图标" />
                <span className="asset-current__badge font-mono">当前使用中</span>
                <span className="asset-current__file font-mono">{editing.imageFile}</span>
              </div>
            )}
            <button type="button" className={`icon-dropzone${iconPath ? ' icon-dropzone--selected' : ''}`} onClick={() => void pickIcon()}>
              {iconPath
                ? <><Icon name="check" /><span className="icon-dropzone__path">{fileName(iconPath)}</span></>
                : <><Icon name="upload" /><span>{isEdit ? '更换图标（PNG / SVG / WebP）' : '选择 PNG / SVG / WebP'}</span></>}
            </button>
            <p className="field-hint">使用真实材质、棚拍光照和接触阴影的高清图标，避免卡通或 emoji。</p>
            <label className="wizard-field-label" style={{ marginTop: '1rem' }}>配色</label>
            <div className="accent-swatches" role="radiogroup" aria-label="配色方案">
              {ACCENT_COLORS.map((c, i) => <button key={c.label} type="button" role="radio" aria-checked={i === accentIdx} aria-label={c.label} className={`accent-swatch${i === accentIdx ? ' accent-swatch--active' : ''}`} style={{ background: `linear-gradient(135deg,${c.c1},${c.c2})` } as CSSProperties} title={c.label} onClick={() => setAccentIdx(i)} />)}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="wizard-body">
            <p className="wizard-field-label">真实录音 / Foley</p>
            <p className="field-hint">{SOUND_UPLOAD_HINT}</p>
            {isEdit && !soundPath && editing.sound.sample?.dataUri && (
              <div className="asset-current asset-current--audio">
                <span className="asset-current__badge font-mono">当前使用中</span>
                <span className="asset-current__file font-mono">{editing.sound.sample.file}</span>
                <audio className="wizard-audio-preview" controls preload="metadata" src={editing.sound.sample.dataUri} aria-label="试听当前音频" />
              </div>
            )}
            <button type="button" className={`icon-dropzone${soundPath ? ' icon-dropzone--selected' : ''}`} onClick={() => void pickSound()}>
              {soundPath
                ? <><Icon name="check" /><span className="icon-dropzone__path">{fileName(soundPath)}</span></>
                : <><Icon name="upload" /><span>{isEdit ? '更换音频文件' : '选择音频文件'}</span></>}
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
                return <button key={id} type="button" role="radio" aria-checked={presetId === id} aria-label={meta.label} className={`effect-preset-tile${presetId === id ? ' effect-preset-tile--active' : ''}`} onClick={() => choosePreset(id)}><EffectIcon name={meta.icon} /><span className="effect-preset-tile__label font-mono">{meta.label}</span></button>;
              })}
            </div>
            <EffectParamSliders presetId={presetId} values={params} onChange={setParams} />
          </div>
        )}

        {error && <p className="wizard-error font-mono">{error}</p>}
        <div className="wizard-nav">
          {step > 0 && <button type="button" className="btn btn--ghost" onClick={() => setStep((s) => (s - 1) as WizardStep)}><Icon name="chevron-left" /> 上一步</button>}
          <span style={{ flex: 1 }} />
          {!isLast
            ? <button type="button" className="btn btn--primary" disabled={(step === 0 && !canNext0) || (step === 1 && !canNext1)} onClick={() => setStep((s) => (s + 1) as WizardStep)}>下一步 <Icon name="chevron-right" /></button>
            : <button type="button" className="btn btn--primary" disabled={submitting} onClick={() => void submit()}>{submitLabel(isEdit, submitting)}</button>}
        </div>
      </div>
    </div>
  );
}

function submitLabel(isEdit: boolean, submitting: boolean): string {
  if (submitting) return isEdit ? '保存中…' : '创建中…';
  return isEdit ? '保存修改' : '完成创建';
}

function fileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);
}
