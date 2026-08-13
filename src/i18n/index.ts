import zhCN from './zh-CN.json';
import enUS from './en-US.json';

export type Locale = 'zh-CN' | 'en-US' | 'auto';
export type TranslationKey = string;

// Type-safe translation keys derived from zh-CN (canonical)
export type Translations = typeof zhCN;

const translations: Record<'zh-CN' | 'en-US', Translations> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

/**
 * Detect system locale from browser navigator.
 * Falls back to zh-CN if unable to determine.
 */
export function detectSystemLocale(): 'zh-CN' | 'en-US' {
  const lang = navigator.language || navigator.languages?.[0] || 'zh-CN';

  // Map common variants to supported locales
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('en')) return 'en-US';

  // Default to zh-CN for unsupported locales
  return 'zh-CN';
}

/**
 * Resolve 'auto' locale to actual locale based on system preference.
 */
export function resolveLocale(locale: Locale): 'zh-CN' | 'en-US' {
  return locale === 'auto' ? detectSystemLocale() : locale;
}

/**
 * Get translation value by dot-notation key path.
 * Example: t('settings.tabs.trigger') → "触发器" or "Trigger"
 */
export function getTranslation(locale: Locale, key: TranslationKey): string {
  const resolved = resolveLocale(locale);
  const dict = translations[resolved];

  // Split key by dots and traverse the nested object
  const keys = key.split('.');
  let value: any = dict;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Key not found: return the key itself as fallback (dev warning)
      console.warn(`[i18n] Missing translation key: ${key} (locale: ${resolved})`);
      return key;
    }
  }

  // If the final value is not a string, return key as fallback
  if (typeof value !== 'string') {
    console.warn(`[i18n] Invalid translation value for key: ${key} (got ${typeof value})`);
    return key;
  }

  return value;
}

/**
 * Get all translations for a specific locale (for debugging/export).
 */
export function getAllTranslations(locale: 'zh-CN' | 'en-US'): Translations {
  return translations[locale];
}
