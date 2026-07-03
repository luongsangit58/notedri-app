import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { useCallback } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/vi'; // 'en' là locale mặc định sẵn có của dayjs
import vi from './vi';
import en from './en';

export type Lang = 'vi' | 'en';

const LANG_KEY = 'app_lang';
// Cờ "ngôn ngữ đổi ở máy nhưng CHƯA đẩy lên tài khoản" (đổi lúc offline). Còn true -> adoptAccountLocale
// KHÔNG ghi đè local bằng locale tài khoản (tránh nuốt lựa chọn), và sẽ thử đẩy lại khi online.
const LANG_PENDING_KEY = 'app_lang_pending_push';
const translations = { vi, en } as const;

// Đồng bộ locale ngày/thứ của dayjs theo ngôn ngữ app (thứ, "x phút trước"...).
dayjs.locale('vi'); // khớp lang mặc định

type Translations = typeof vi;
type Key = keyof Translations;

interface I18nState {
  lang: Lang;
  localePendingPush: boolean;
  setLang: (lang: Lang) => Promise<void>;
  setLocalePendingPush: (pending: boolean) => Promise<void>;
  loadSaved: () => Promise<void>;
  t: (key: Key, params?: Record<string, string | number>) => string;
}

export const useI18nStore = create<I18nState>((set, get) => ({
  lang: 'vi',
  localePendingPush: false,

  setLang: async (lang: Lang) => {
    await SecureStore.setItemAsync(LANG_KEY, lang);
    dayjs.locale(lang);
    set({ lang });
  },

  setLocalePendingPush: async (pending: boolean) => {
    try { await SecureStore.setItemAsync(LANG_PENDING_KEY, pending ? '1' : '0'); } catch { /* noop */ }
    set({ localePendingPush: pending });
  },

  loadSaved: async () => {
    const saved = await SecureStore.getItemAsync(LANG_KEY) as Lang | null;
    if (saved === 'vi' || saved === 'en') {
      dayjs.locale(saved);
      set({ lang: saved });
    }
    try {
      const pending = await SecureStore.getItemAsync(LANG_PENDING_KEY);
      set({ localePendingPush: pending === '1' });
    } catch { /* noop */ }
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
