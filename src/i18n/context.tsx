import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { getTranslation, resolveLocale, type Locale, type TranslationKey } from './index';
import { getConfig, saveConfig } from '../shared/ipc';

interface I18nContextValue {
  locale: Locale;
  resolvedLocale: 'zh-CN' | 'en-US';
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

interface I18nProviderProps {
  children: ReactNode;
}

/**
 * I18n provider component.
 * Loads locale from config on mount and provides translation function.
 */
export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>('auto');
  const resolvedLocale = resolveLocale(locale);

  // Load locale from config on mount
  useEffect(() => {
    getConfig()
      .then((config) => {
        if (config.language) {
          setLocaleState(config.language);
        }
      })
      .catch((err) => {
        console.error('[i18n] Failed to load locale from config:', err);
      });
  }, []);

  // Translation function bound to current locale
  const t = (key: TranslationKey): string => getTranslation(locale, key);

  // Set locale and persist to config
  const setLocale = async (newLocale: Locale): Promise<void> => {
    setLocaleState(newLocale);

    try {
      const config = await getConfig();
      await saveConfig({ ...config, language: newLocale });
    } catch (err) {
      console.error('[i18n] Failed to save locale to config:', err);
      throw err;
    }
  };

  return (
    <I18nContext.Provider value={{ locale, resolvedLocale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * Hook to access i18n context.
 * Must be used inside I18nProvider.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}

/**
 * Convenience hook that only returns the translation function.
 * Use when you don't need locale state or setLocale.
 */
export function useTranslation() {
  const { t } = useI18n();
  return { t };
}
