import { create } from 'zustand';
import { Appearance } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'dark' | 'light';

export interface ColorPalette {
  primary: string;
  primaryText: string;
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
  primary: '#D97706',
  primaryText: '#FFFFFF',
  background: '#0d1527',
  surface: '#1a2744',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  border: '#2d3f63',
  card: '#162035',
};

export const lightColors: ColorPalette = {
  primary: '#D97706',
  primaryText: '#FFFFFF',
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
  followSystem: boolean; // true = chưa tự chọn -> bám theo OS (kể cả khi OS đổi lúc app đang chạy)
  setMode: (mode: ThemeMode) => Promise<void>;
  toggle: () => Promise<void>;
  loadSaved: () => Promise<void>;
  applySystemIfFollowing: () => void; // gọi khi OS đổi chế độ sáng/tối
}

// Khởi tạo theo OS ngay từ đầu (đồng bộ) -> tránh nháy dark 1 nhịp trên máy để sáng
// trước khi loadSaved() chạy. loadSaved() sau đó ghi đè bằng lựa chọn đã lưu (nếu có).
const initialMode: ThemeMode = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  colors: initialMode === 'dark' ? darkColors : lightColors,
  followSystem: true, // chưa biết có lựa chọn đã lưu -> tạm bám OS; loadSaved() xác định lại

  setMode: async (mode: ThemeMode) => {
    await SecureStore.setItemAsync(THEME_KEY, mode);
    // User TỰ chọn -> khoá theo OS.
    set({ mode, colors: mode === 'dark' ? darkColors : lightColors, followSystem: false });
  },

  toggle: async () => {
    const next: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    await get().setMode(next);
  },

  loadSaved: async () => {
    const saved = await SecureStore.getItemAsync(THEME_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') {
      // User ĐÃ tự chọn -> tôn trọng, không theo OS nữa.
      set({ mode: saved, colors: saved === 'dark' ? darkColors : lightColors, followSystem: false });
      return;
    }
    // CHƯA chọn -> theo chế độ HỆ ĐIỀU HÀNH (giống web). OS sáng -> light, còn lại -> dark.
    const mode: ThemeMode = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
    set({ mode, colors: mode === 'dark' ? darkColors : lightColors, followSystem: true });
  },

  // Live-follow: khi OS đổi sáng/tối lúc app đang chạy, cập nhật ngay NẾU user chưa tự chọn.
  applySystemIfFollowing: () => {
    if (!get().followSystem) return;
    const mode: ThemeMode = Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
    if (mode !== get().mode) {
      set({ mode, colors: mode === 'dark' ? darkColors : lightColors });
    }
  },
}));

/** Hook — use inside any component. Returns current color palette. */
export const useColors = (): ColorPalette => useThemeStore(s => s.colors);
