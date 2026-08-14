import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  listSoundPresets,
  setCrackSound,
  uploadCustomSound,
  deleteCustomSound,
  readSoundData,
  type SoundPreset,
} from '../../shared/ipc';
import type { PanelProps } from './panel-props';

export function SoundPicker({ config, onPatch }: PanelProps) {
  const [presets, setPresets] = useState<SoundPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    loadPresets();
  }, []);

  async function loadPresets() {
    try {
      const list = await listSoundPresets();
      setPresets(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function preview(preset: SoundPreset) {
    setError(null);
    setPlaying(preset.id);
    try {
      // A preset with its own files previews the first; "default" (no files of
      // its own) previews the skin-level whip crack at the sounds root.
      const file = preset.files[0] ?? 'whip.m4a';
      const dataUri = await readSoundData(preset.id, file);
      const audio = new Audio(dataUri);
      audio.volume = 0.6;
      audio.onended = () => setPlaying(null);
      audio.onerror = () => setPlaying(null);
      await audio.play();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPlaying(null);
    }
  }

  async function choose(presetId: string) {
    try {
      await setCrackSound(presetId);
      onPatch({ crackSoundId: presetId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpload() {
    try {
      setUploading(true);
      setError(null);

      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择音效文件夹',
      });

      if (!selected) return;

      const name = prompt('音效包名称：');
      if (!name) return;

      await uploadCustomSound(selected, name);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此音效包？')) return;
    try {
      await deleteCustomSound(id);
      if (config.crackSoundId === id) {
        await setCrackSound('default');
        onPatch({ crackSoundId: 'default' });
      }
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <p className="field-hint">加载音效列表中…</p>;

  return (
    <div className="sound-picker">
      <div className="sound-picker__list" role="radiogroup" aria-label="音效包选择">
        {presets.map((preset) => {
          const isActive = preset.id === config.crackSoundId;
          return (
            <div
              key={preset.id}
              className={`sound-card${isActive ? ' sound-card--active' : ''}`}
              role="radio"
              aria-checked={isActive}
            >
              <button
                type="button"
                className="sound-card__body"
                onClick={() => void choose(preset.id)}
              >
                <span className="sound-card__name">{preset.name}</span>
                <span className="sound-card__meta">
                  {preset.files.length > 0
                    ? `${preset.files.length} 个音频`
                    : '跟随皮肤'}
                </span>
              </button>
              <button
                type="button"
                className="sound-card__preview"
                onClick={() => void preview(preset)}
                disabled={playing === preset.id}
                aria-label={`试听 ${preset.name}`}
                title="试听"
              >
                {playing === preset.id ? '♪' : '▶'}
              </button>
              {!preset.isBuiltin && (
                <button
                  type="button"
                  className="sound-card__delete"
                  onClick={() => void handleDelete(preset.id)}
                  aria-label="删除"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="sound-picker__upload"
        onClick={() => void handleUpload()}
        disabled={uploading}
      >
        {uploading ? '上传中…' : '+ 上传自定义音效'}
      </button>

      {error && (
        <div className="callout callout--error" role="alert">
          <p className="callout__text">{error}</p>
        </div>
      )}
    </div>
  );
}
