import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  listMaterials,
  setActiveMaterial,
  uploadCustomMaterial,
  deleteCustomMaterial,
} from '../../shared/ipc';
import { DEFAULT_MATERIAL_ID, type Material } from '../../shared/materials';
import type { PanelProps } from './panel-props';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; materials: Material[] }
  | { status: 'error'; message: string };

/**
 * 素材选择器 —— 视觉外观的主选择轴（与配色皮肤、音效解耦）。
 *
 * 统一网格：内置图片素材 + 用户自定义图片（可删）+ 上传卡。所有素材均为
 * 图片，缩略图直接用 Rust 内联的 `dataUri` 渲染（规避 asset 协议路径问题）。
 * 单选 radiogroup，选中即 setActiveMaterial 并向上 onPatch。
 */
export function MaterialPicker({ config, onPatch }: PanelProps) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [failure, setFailure] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void reload(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload(isCancelled: () => boolean = () => false) {
    try {
      const materials = await listMaterials();
      if (!isCancelled()) setLoad({ status: 'ready', materials });
    } catch (error) {
      if (!isCancelled()) {
        setLoad({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async function choose(id: string) {
    setFailure(null);
    try {
      await setActiveMaterial(id);
      onPatch({ activeMaterialId: id });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDelete(id: string) {
    setFailure(null);
    try {
      await deleteCustomMaterial(id);
      if (config.activeMaterialId === id) {
        await setActiveMaterial(DEFAULT_MATERIAL_ID);
        onPatch({ activeMaterialId: DEFAULT_MATERIAL_ID });
      }
      await reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleUpload() {
    setFailure(null);
    setUploading(true);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
      });
      if (typeof selected !== 'string') return;
      const created = await uploadCustomMaterial(selected);
      await reload();
      await choose(created.id);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }

  if (load.status === 'loading') {
    return <p className="field-hint">正在读取素材列表…</p>;
  }

  if (load.status === 'error') {
    return (
      <div className="callout callout--error" role="alert">
        <p className="callout__text font-mono">{load.message}</p>
      </div>
    );
  }

  return (
    <div className="material-picker">
      <div className="material-grid" role="radiogroup" aria-label="素材选择">
        {load.materials.map((material) => {
          const isActive = material.id === config.activeMaterialId;
          return (
            <div
              key={material.id}
              className={`material-card${isActive ? ' material-card--active' : ''}`}
              role="radio"
              aria-checked={isActive}
              aria-label={material.name}
              tabIndex={0}
              onClick={() => void choose(material.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void choose(material.id);
                }
              }}
            >
              <span className="material-card__body">
                <span className="material-card__thumb" aria-hidden="true">
                  <img
                    className="material-card__img"
                    src={material.dataUri}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </span>
                <span className="material-card__name font-display">{material.name}</span>
              </span>
              {!material.builtin && (
                <button
                  type="button"
                  className="material-card__delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(material.id);
                  }}
                  aria-label={`删除 ${material.name}`}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="material-picker__upload"
          onClick={() => void handleUpload()}
          disabled={uploading}
        >
          <span className="material-picker__upload-glyph" aria-hidden="true">
            +
          </span>
          <span className="material-picker__upload-label">
            {uploading ? '上传中…' : '上传素材图片'}
          </span>
        </button>
      </div>

      <p className="field-hint">支持 PNG / JPG / GIF / SVG / WebP，建议正方形透明底。</p>

      {failure && (
        <div className="callout callout--error" role="alert">
          <p className="callout__text font-mono">{failure}</p>
        </div>
      )}
    </div>
  );
}
