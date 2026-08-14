import { useEffect, useState } from 'react';
import { activateSkin, listSkins } from '../../shared/ipc';
import type { SkinManifest } from '../../shared/skins';
import { MaterialPicker } from './MaterialPicker';
import { SoundPicker } from './SoundPicker';
import type { PanelProps } from './panel-props';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; skins: SkinManifest[] }
  | { status: 'error'; message: string };

/**
 * Appearance settings panel — three decoupled axes:
 * 1. Material (cursor / burst visual, image or vector effect)
 * 2. Palette (whip body + particle colour theme)
 * 3. Sound pack (crack sound, independent of the above)
 */
export function SkinsPanel({ config, onPatch }: PanelProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSkins()
      .then((skins) => {
        if (!cancelled) setLoad({ status: 'ready', skins });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function choose(skinId: string) {
    setPending(skinId);
    setFailure(null);
    try {
      await activateSkin(skinId);
      onPatch({ activeSkin: skinId });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="field-stack">
      {/* ── Section 1: Material (visual appearance) ── */}
      <section className="field">
        <h2 className="field__label">素材</h2>
        <p className="field__desc">甩动 / 点击时呈现的视觉图形。切换后下一次触发即生效。</p>
        <MaterialPicker config={config} onPatch={onPatch} />
      </section>

      {/* ── Section 2: Palette (colour theme) ── */}
      <section className="field">
        <h2 className="field__label">配色</h2>
        <p className="field__desc">鞭身与粒子的配色主题。</p>

        {load.status === 'loading' && <p className="field-hint">正在读取皮肤列表…</p>}

        {load.status === 'error' && (
          <div className="callout callout--error" role="alert">
            <p className="callout__text font-mono">{load.message}</p>
          </div>
        )}

        {load.status === 'ready' && (
          <div className="skin-grid" role="radiogroup" aria-label="皮肤选择">
            {load.skins.map((skin) => {
              const isActive = skin.id === config.activeSkin;
              return (
                <button
                  key={skin.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  className={`skin-card${isActive ? ' skin-card--active' : ''}`}
                  disabled={pending !== null}
                  onClick={() => void choose(skin.id)}
                >
                  <span
                    className="skin-card__swatch"
                    aria-hidden="true"
                    style={{
                      background: `linear-gradient(135deg, ${skin.visuals.bodyGradient[0]}, ${skin.visuals.bodyGradient[1]})`,
                    }}
                  />
                  <span className="skin-card__name font-display">{skin.name}</span>
                  {skin.description && (
                    <span className="skin-card__desc">{skin.description}</span>
                  )}
                  {pending === skin.id && <span className="skin-card__pending">切换中…</span>}
                </button>
              );
            })}
          </div>
        )}

        {failure && (
          <div className="callout callout--error" role="alert">
            <p className="callout__text font-mono">{failure}</p>
          </div>
        )}
      </section>

      {/* ── Section 3: Sound Pack ── */}
      <section className="field">
        <h2 className="field__label">音效</h2>
        <p className="field__desc">
          选择音效包。"默认"跟随皮肤内置音效，其他音效包可自由搭配。
        </p>
        <SoundPicker config={config} onPatch={onPatch} />
      </section>
    </div>
  );
}
