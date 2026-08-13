import { useEffect, useState } from 'react';
import { activateSkin, listSkins } from '../../shared/ipc';
import type { SkinManifest } from '../../shared/skins';
import type { PanelProps } from './panel-props';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; skins: SkinManifest[] }
  | { status: 'error'; message: string };

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
      // Rust persists activeSkin and emits skin-changed; mirror it locally so
      // the selected state updates without waiting for the round trip.
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
      <section className="field">
        <h2 className="field__label">皮肤</h2>
        <p className="field__desc">切换后下一次触发催促即生效。</p>

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
    </div>
  );
}
