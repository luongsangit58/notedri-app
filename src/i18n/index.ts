import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { useCallback } from 'react';
import vi from './vi';
import en from './en';

export type Lang = 'vi' | 'en';

const LANG_KEY = 'app_lang';
const translations = { vi, en } as const;

type Translations = typeof vi;
type Key = keyof Translations;

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
  loadSaved: () => Promise<void>;
  t: (key: Key, params?: Record<string, string | number>) => string;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  lang: 'vi',

  setLang: async (lang: Lang) => {
    await SecureStore.setItemAsync(LANG_KEY, lang);
    set({ lang });
  },

  loadSaved: async () => {
    const saved = await SecureStore.getItemAsync(LANG_KEY) as Lang | null;
    if (saved === 'vi' || saved === 'en') set({ lang: saved });
  },

  t: (key: Key, params?: Record<string, string | number>): string => {
    const lang = get().lang;
    const dict = translations[lang] as Record<string, string>;
    let str = dict[key] ?? (translations.vi as Record<string, string>)[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
      });
    }
    return str;
  },
}));

export const useLang = () => useI18nStore(s => s.lang);

/**
 * Hook — returns a translation function that re-creates when `lang` changes.
 * Using useLang() as a dependency ensures Zustand re-renders consumers on lang change.
 */
export const useT = () => {
  const lang = useLang();
  return useCallback(
    (key: Key, params?: Record<string, string | number>): string => {
      const dict = translations[lang] as Record<string, string>;
      let str = dict[key] ?? (translations.vi as Record<string, string>)[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
        });
      }
      return str;
    },
    [lang],
  );
};
