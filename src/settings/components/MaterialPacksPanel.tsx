import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { listPacks, setActivePack, deleteCustomPack } from '../../shared/ipc';
import type { MaterialPack } from '../../shared/material-packs';
import type { PanelProps } from './panel-props';
import { CreatePackWizard } from './CreatePackWizard';
import { Icon } from './Icon';
import {
  familyCounts,
  familyForPack,
  familyMeta,
  matchesPack,
  PACK_FAMILIES,
  type PackFamily,
  effectLabel,
  physicsMode,
  soundSignature,
} from './material-pack-display';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; packs: MaterialPack[] }
  | { status: 'error'; message: string };

function nextRadioIndex(key: string, index: number, length: number): number | null {
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (index + 1) % length;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (index - 1 + length) % length;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}

export function MaterialPacksPanel({ config, onPatch }: PanelProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [family, setFamily] = useState<PackFamily>('all');
  const [query, setQuery] = useState('');
  const [rovingPackId, setRovingPackId] = useState(config.activePackId);
  const familyRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const packRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    let cancelled = false;
    void reload(() => cancelled);
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRovingPackId(config.activePackId);
  }, [config.activePackId]);

  async function reload(isCancelled = () => false) {
    try {
      const packs = await listPacks();
      if (!isCancelled()) setLoad({ status: 'ready', packs });
    } catch (error) {
      if (!isCancelled()) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function choose(id: string) {
    setFailure(null);
    setRovingPackId(id);
    try {
      await setActivePack(id);
      onPatch({ activePackId: id });
    } catch (error) {
      setRovingPackId(config.activePackId);
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDelete(id: string) {
    setFailure(null);
    try {
      await deleteCustomPack(id);
      if (config.activePackId === id) {
        await setActivePack('rocket');
        setRovingPackId('rocket');
        onPatch({ activePackId: 'rocket' });
      }
      await reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function onPackCreated(pack: MaterialPack) {
    setWizardOpen(false);
    await reload();
    await choose(pack.id);
  }

  const filtered = useMemo(() => {
    if (load.status !== 'ready') return [];
    return load.packs.filter((pack) => matchesPack(pack, query, family));
  }, [load, query, family]);
  const counts = load.status === 'ready' ? familyCounts(load.packs) : null;
  const activePack = load.status === 'ready' ? load.packs.find((pack) => pack.id === config.activePackId) : undefined;
  const tabbablePackId = filtered.some((pack) => pack.id === rovingPackId) ? rovingPackId : filtered[0]?.id;

  function handleFamilyKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextRadioIndex(event.key, index, PACK_FAMILIES.length);
    if (nextIndex === null) return;

    event.preventDefault();
    setFamily(PACK_FAMILIES[nextIndex].id);
    familyRefs.current[nextIndex]?.focus();
  }

  function handlePackKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextRadioIndex(event.key, index, filtered.length);
    if (nextIndex === null) return;

    event.preventDefault();
    const nextPack = filtered[nextIndex];
    void choose(nextPack.id);
    packRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="material-library">
      <div className="packs-intro">
        <p className="packs-subtitle">选择一套素材，同时切换图标、运动特效与音效。</p>
        <button type="button" className="btn btn--primary packs-new-btn" onClick={() => setWizardOpen(true)}>
          <Icon name="plus" />
          <span>新建场景</span>
        </button>
      </div>

      {load.status === 'loading' && <p className="field-hint">正在读取素材包…</p>}
      {load.status === 'error' && <div className="callout callout--error" role="alert"><p className="callout__text font-mono">{load.message}</p></div>}

      {load.status === 'ready' && (
        <>
          <div className="pack-toolbar" aria-label="素材库状态">
            <span className="pack-toolbar__count">显示 <strong>{filtered.length}</strong> / 共 {load.packs.length}</span>
            <span className="pack-toolbar__active">当前启用：<strong>{activePack?.name ?? '火箭'}</strong></span>
          </div>

          <div className="pack-controls">
            <div className="pack-families" role="radiogroup" aria-label="素材系列">
              {PACK_FAMILIES.map((item, index) => (
                <button key={item.id} type="button" role="radio" aria-checked={family === item.id} tabIndex={family === item.id ? 0 : -1}
                  ref={(node) => { familyRefs.current[index] = node; }}
                  className={`pack-family-tab${family === item.id ? ' pack-family-tab--active' : ''}`} onClick={() => setFamily(item.id)}
                  onKeyDown={(event) => handleFamilyKeyDown(event, index)}>
                  <span>{item.shortLabel}</span><span className="pack-family-tab__count font-mono">{counts?.[item.id] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="pack-search">
              <Icon name="search" className="pack-search__icon" />
              <label className="sr-only" htmlFor="pack-search-input">搜索素材</label>
              <input id="pack-search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、特效或物理模式" aria-label="搜索素材名称、特效或物理模式" />
              {query && <button type="button" className="pack-search__clear" onClick={() => setQuery('')} aria-label="清除搜索"><Icon name="close" /></button>}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="pack-empty" role="status"><strong>未找到匹配素材</strong><p>调整系列或搜索词后重试</p></div>
          ) : (
            <div className="pack-grid" role="radiogroup" aria-label="素材包">
              {filtered.map((pack, index) => {
                const isActive = pack.id === config.activePackId;
                const packFamily = familyForPack(pack.id);
                const meta = familyMeta(packFamily);
                const glow = `hsl(${pack.palette.particleHue}, 90%, 60%)`;
                return (
                  <div key={pack.id} className={`pack-card-shell${pack.builtin ? '' : ' pack-card-shell--custom'}`}>
                  <button type="button" role="radio" aria-checked={isActive} tabIndex={pack.id === tabbablePackId ? 0 : -1}
                    ref={(node) => { packRefs.current[index] = node; }}
                    className={`pack-card pack-card--${packFamily}${isActive ? ' pack-card--active' : ''}`} style={{ '--pack-glow': glow } as CSSProperties}
                    onClick={() => void choose(pack.id)} onKeyDown={(event) => handlePackKeyDown(event, index)}>
                    <span className="pack-card__marker" aria-hidden="true" />
                    <span className="pack-card__icon" aria-hidden="true"><img className="pack-card__img" src={pack.dataUri} alt="" loading="lazy" decoding="async" /></span>
                    <span className="pack-card__content">
                      <span className="pack-card__heading">
                        <span className="pack-card__name">{pack.name}</span>
                        <span className="pack-card__family">{meta.label}</span>
                      </span>
                      <span className="pack-card__effect">{effectLabel(pack.effect.preset)}</span>
                      <span className="pack-card__fingerprint">
                        <span><small>运动模型</small><strong>{physicsMode(pack.effect.preset)}</strong></span>
                        <span><small>声学指纹</small><strong>{soundSignature(pack.sound)} · {pack.sound.layers.length} 层</strong></span>
                      </span>
                    </span>
                  </button>
                  {!pack.builtin && <button type="button" className="pack-card__del" aria-label={`删除 ${pack.name}`} onClick={() => void handleDelete(pack.id)}><Icon name="trash" /></button>}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {failure && <div className="callout callout--error" role="alert"><p className="callout__text font-mono">{failure}</p></div>}
      {wizardOpen && <CreatePackWizard onCreated={(pack) => void onPackCreated(pack)} onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
