import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';
import { STORAGE_KEYS } from '../shared/constants';

export type Locale = 'en' | 'zh-TW' | 'zh-CN';
type TranslationMap = Record<string, string>;

const locales: Record<Locale, TranslationMap> = {
  'en': en,
  'zh-TW': zhTW,
  'zh-CN': zhCN,
};

let currentLocale: Locale = 'en';
const listeners: Set<(locale: Locale) => void> = new Set();

/** Detect the best locale from browser/extension settings */
function detectLocale(): Locale {
  try {
    // Try Chrome extension API first
    if (typeof chrome !== 'undefined' && chrome.i18n) {
      const uiLang = chrome.i18n.getUILanguage();
      if (uiLang.startsWith('zh-TW') || uiLang.startsWith('zh-Hant')) return 'zh-TW';
      if (uiLang.startsWith('zh')) return 'zh-CN';
      return 'en';
    }
  } catch {
    // Not in extension context
  }

  // Fallback to navigator.language
  const lang = navigator.language;
  if (lang.startsWith('zh-TW') || lang.startsWith('zh-Hant')) return 'zh-TW';
  if (lang.startsWith('zh')) return 'zh-CN';
  return 'en';
}

/** Initialize i18n — loads saved preference or auto-detects */
export async function initI18n(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const data = await chrome.storage.sync.get(STORAGE_KEYS.LOCALE);
      if (data[STORAGE_KEYS.LOCALE] && data[STORAGE_KEYS.LOCALE] in locales) {
        currentLocale = data[STORAGE_KEYS.LOCALE] as Locale;
        return;
      }
    }
  } catch {
    // Not in extension context
  }
  currentLocale = detectLocale();
}

/** Get a translated string by key, with optional interpolation */
export function t(key: string, ...args: (string | number)[]): string {
  const map = locales[currentLocale] ?? locales['en'];
  let text = map[key] ?? locales['en'][key] ?? key;

  // Replace {0}, {1}, etc. with provided arguments
  args.forEach((arg, i) => {
    text = text.replace(`{${i}}`, String(arg));
  });

  return text;
}

/** Get current locale */
export function getLocale(): Locale {
  return currentLocale;
}

/** Set locale and persist */
export async function setLocale(locale: Locale): Promise<void> {
  currentLocale = locale;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.sync.set({ [STORAGE_KEYS.LOCALE]: locale });
    }
  } catch {
    // Not in extension context
  }
  listeners.forEach(fn => fn(locale));
}

/** Subscribe to locale changes */
export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Get all available locales with display names */
export function getAvailableLocales(): { code: Locale; name: string }[] {
  return [
    { code: 'en', name: 'English' },
    { code: 'zh-TW', name: '繁體中文' },
    { code: 'zh-CN', name: '简体中文' },
  ];
}
