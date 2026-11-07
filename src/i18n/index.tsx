import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fa, type Dictionary } from './fa.js';
import { en } from './en.js';

export type Locale = 'fa' | 'en';

const dictionaries: Record<Locale, Dictionary> = { fa, en };

interface I18nValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
  /** Formats a time like ۱۴:۰۵ (Persian digits in fa). */
  formatTime: (iso: string) => string;
  /** Formats a date like «۷ آبان ۱۴۰۴» / "Nov 7, 2026". */
  formatDate: (iso: string) => string;
  /** Group heading for message lists: Today / Yesterday / full date. */
  formatDayLabel: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const LOCALE_KEY = 'mg_locale';

/** Module-level mirror of the current dictionary — lets non-React code (stores) localize. */
let currentDict: Dictionary = fa;
export function getCurrentDict(): Dictionary {
  return currentDict;
}

function detectInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved === 'fa' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return 'fa';
}

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? detectInitialLocale);

  useEffect(() => {
    const dict = dictionaries[locale];
    currentDict = dict;
    document.documentElement.lang = locale;
    document.documentElement.dir = dict.dir;
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch { /* ignore */ }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  const value = useMemo<I18nValue>(() => {
    const intlLocale = locale === 'fa' ? 'fa-IR' : 'en-US';
    const timeFmt = new Intl.DateTimeFormat(intlLocale, { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateFmt = new Intl.DateTimeFormat(intlLocale, { year: 'numeric', month: 'long', day: 'numeric' });
    const dayFmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const dayKey = (iso: string): string => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };

    return {
      locale,
      t: dictionaries[locale],
      setLocale,
      formatTime: (iso) => timeFmt.format(new Date(iso)),
      formatDate: (iso) => dateFmt.format(new Date(iso)),
      formatDayLabel: (iso) => {
        const now = new Date();
        const d = new Date(iso);
        const todayKey = dayKey(now.toISOString());
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (dayKey(iso) === todayKey) return dictionaries[locale].common.today;
        if (dayKey(iso) === dayKey(yesterday.toISOString())) return dictionaries[locale].common.yesterday;
        return dayFmt.format(d);
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
