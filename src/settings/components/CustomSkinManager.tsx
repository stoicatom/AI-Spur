import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from '../../i18n/context';
import {
  listCustomSkins,
  importCustomSkin,
  deleteCustomSkin,
  type CustomSkinManifest,
} from '../../shared/custom-skins-ipc';
import styles from './CustomSkinManager.module.css';

export function CustomSkinManager() {
  const { t } = useTranslation();
  const [skins, setSkins] = useState<CustomSkinManifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load custom skins on mount
  useEffect(() => {
    loadSkins();
  }, []);

  const loadSkins = async () => {
    try {
      const loaded = await listCustomSkins();
      setSkins(loaded);
      setError(null);
    } catch (err) {
      setError(String(err));
      console.error('[CustomSkinManager] Failed to load skins:', err);
    }
  };

  const handleImport = async () => {
    try {
      setLoading(true);
      setError(null);

      // Open directory picker
      const selected = await open({
        directory: true,
        multiple: false,
        title: t('skins.uploadSkin'),
      });

      if (!selected) {
        setLoading(false);
        return; // User cancelled
      }

      // Prompt for skin name
      const skinName = prompt(t('skins.enterSkinName') || 'Enter skin name:');
      if (!skinName) {
        setLoading(false);
        return;
      }

      // Import skin
      await importCustomSkin(selected, skinName);

      // Reload list
      await loadSkins();
    } catch (err) {
      setError(String(err));
      console.error('[CustomSkinManager] Import failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (skinId: string) => {
    const confirmed = confirm(t('skins.deleteConfirm') || 'Delete this skin?');
    if (!confirmed) return;

    try {
      await deleteCustomSkin(skinId);
      await loadSkins();
    } catch (err) {
      setError(String(err));
      console.error('[CustomSkinManager] Delete failed:', err);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('skins.custom')}</h3>
        <button
          type="button"
          onClick={handleImport}
          disabled={loading}
          className={styles.importButton}
        >
          {loading ? t('common.loading') : t('skins.uploadSkin')}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {skins.length === 0 ? (
        <div className={styles.empty}>{t('skins.noCustomSkins')}</div>
      ) : (
        <ul className={styles.list}>
          {skins.map((skin) => (
            <li key={skin.id} className={styles.item}>
              <div className={styles.info}>
                <span className={styles.name}>{skin.name}</span>
                <span className={styles.meta}>
                  {skin.sounds.length} {t('skins.soundFiles')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(skin.id)}
                className={styles.deleteButton}
                aria-label={t('common.delete')}
              >
                {t('common.delete')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
