import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CockpitThemeMode = 'dark' | 'light';

const COCKPIT_THEME_KEY = 'obd_cockpit_theme_mode';

interface CockpitThemeState {
  mode: CockpitThemeMode;
  loadSaved: () => Promise<void>;
  toggle: () => void;
}

// Rà soát 24/7 (góp ý user: màn OBD2 Live đang ăn theo theme sáng/tối CHUNG
// của app - không hợp lý vì trong xe luôn cần tối để dễ nhìn, không nên phụ
// thuộc lựa chọn giao diện người dùng đặt cho phần còn lại của app). Store
// RIÊNG cho cockpit, mặc định LUÔN LÀ TỐI (không đọc theo Appearance hệ
// thống như useThemeStore) - user tự bấm nút chuyển sáng ngay trong màn Đồng
// hồ nếu cần, lựa chọn đó lưu riêng, không ảnh hưởng theme sáng/tối cả app.
export const useCockpitThemeStore = create<CockpitThemeState>((set, get) => ({
  mode: 'dark',
  loadSaved: async () => {
    const saved = (await AsyncStorage.getItem(COCKPIT_THEME_KEY).catch(() => null)) as CockpitThemeMode | null;
    if (saved === 'light' || saved === 'dark') set({ mode: saved });
  },
  toggle: () => {
    const next: CockpitThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    set({ mode: next });
    AsyncStorage.setItem(COCKPIT_THEME_KEY, next).catch(() => {});
  },
}));
