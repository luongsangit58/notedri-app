import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'dark' | 'light';

export interface ColorPalette {
  primary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  card: string;
}

export const darkColors: ColorPalette = {
  primary: '#E85D04',
  background: '#121212',
  surface: '#1E1E1E',
  text: '#FFFFFF',
  textSecondary: '#9E9E9E',
  success: '#4CAF50',
  warning: '#FF9800',
  error: '#F44336',
  border: '#2E2E2E',
  card: '#252525',
};

export const lightColors: ColorPalette = {
  primary: '#E85D04',
  background: '#F4F4F5',
  surface: '#FFFFFF',
  text: '#111827',
  textSecondary: '#6B7280',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  border: '#E5E7EB',
  card: '#FAFAFA',
};

const THEME_KEY = 'app_theme';

interface ThemeState {
  mode: ThemeMode;
  colors: ColorPalette;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
  loadSaved: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'dark',
  colors: darkColors,

  setMode: async (mode: ThemeMode) => {
    await SecureStore.setItemAsync(THEME_KEY, mode);
    set({ mode, colors: mode === 'dark' ? darkColors : lightColors });
  },

  toggle: async () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    await get().setMode(next);
  },

  loadSaved: async () => {
    const saved = await SecureStore.getItemAsync(THEME_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      set({ mode: saved, colors: saved === 'dark' ? darkColors : lightColors });
    }
  },
}));

/** Hook — use inside any component. Returns current color palette. */
export const useColors = (): ColorPalette => useThemeStore(s => s.colors);
