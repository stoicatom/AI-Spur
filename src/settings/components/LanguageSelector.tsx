import { useI18n } from '../../i18n/context';
import type { Locale } from '../../i18n';
import styles from './LanguageSelector.module.css';

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value as Locale;
    setLocale(newLocale).catch((err) => {
      console.error('[LanguageSelector] Failed to save locale:', err);
    });
  };

  return (
    <div className={styles.container}>
      <label htmlFor="language-select" className={styles.label}>
        {t('advanced.language')}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={handleChange}
        className={styles.select}
      >
        <option value="auto">{t('advanced.languages.auto')}</option>
        <option value="zh-CN">{t('advanced.languages.zh-CN')}</option>
        <option value="en-US">{t('advanced.languages.en-US')}</option>
      </select>
    </div>
  );
}
