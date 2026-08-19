import { useEffect, useState, type CSSProperties } from 'react';
import { listPacks, setActivePack, deleteCustomPack } from '../../shared/ipc';
import type { MaterialPack } from '../../shared/material-packs';
import type { PanelProps } from './panel-props';
import { CreatePackWizard } from './CreatePackWizard';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; packs: MaterialPack[] }
  | { status: 'error'; message: string };

/**
 * 素材包面板 — v3 三轴合一的主选择页。
 * 大卡片网格展示内置 30 个包 + 用户自定义包，支持新建向导。
 */
export function MaterialPacksPanel({ config, onPatch }: PanelProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void doReload(() => cancelled);
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doReload(isCancelled = () => false) {
    try {
      const packs = await listPacks();
      if (!isCancelled()) setLoad({ status: 'ready', packs });
    } catch (e) {
      if (!isCancelled())
        setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function choose(id: string) {
    setFailure(null);
    try {
      await setActivePack(id);
      onPatch({ activePackId: id });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: string) {
    setFailure(null);
    try {
      await deleteCustomPack(id);
      if (config.activePackId === id) {
        await setActivePack('rocket');
        onPatch({ activePackId: 'rocket' });
      }
      await doReload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    }
  }

  async function onPackCreated(pack: MaterialPack) {
    setWizardOpen(false);
    await doReload();
    await choose(pack.id);
  }

  return (
    <div className="field-stack">
      <div className="packs-header">
        <div>
          <h2 className="field__label">素材包</h2>
          <p className="field__desc">图标 + 特效动画 + 声音三合一——选择即生效。</p>
        </div>
        <button type="button" className="btn btn--primary packs-new-btn"
          onClick={() => setWizardOpen(true)}>
          <span aria-hidden="true">＋</span>&thinsp;新建素材
        </button>
      </div>

      {load.status === 'loading' && <p className="field-hint">正在读取素材包…</p>}

      {load.status === 'error' && (
        <div className="callout callout--error" role="alert">
          <p className="callout__text font-mono">{load.message}</p>
        </div>
      )}

      {load.status === 'ready' && (
        <div className="pack-grid" role="radiogroup" aria-label="素材包">
          {load.packs.map((pack) => {
            const isActive = pack.id === config.activePackId;
            const glow = `hsl(${pack.palette.particleHue},90%,60%)`;
            return (
              <div key={pack.id} role="radio" aria-checked={isActive} tabIndex={0}
                className={`pack-card${isActive ? ' pack-card--active' : ''}`}
                style={{ '--pack-glow': glow } as CSSProperties}
                onClick={() => void choose(pack.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void choose(pack.id); }
                }}>
                <span className="pack-card__halo" aria-hidden="true" />
                <span className="pack-card__icon" aria-hidden="true">
                  <img className="pack-card__img" src={pack.dataUri} alt="" />
                </span>
                <span className="pack-card__name font-display">{pack.name}</span>
                <span className="pack-card__badge font-mono">{pack.effect.preset}</span>
                {!pack.builtin && (
                  <button type="button" className="pack-card__del"
                    aria-label={`删除 ${pack.name}`}
                    onClick={(e) => { e.stopPropagation(); void handleDelete(pack.id); }}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {failure && (
        <div className="callout callout--error" role="alert">
          <p className="callout__text font-mono">{failure}</p>
        </div>
      )}

      {wizardOpen && (
        <CreatePackWizard
          onCreated={(p) => void onPackCreated(p)}
          onClose={() => setWizardOpen(false)}
        />
      )}
    </div>
  );
}
