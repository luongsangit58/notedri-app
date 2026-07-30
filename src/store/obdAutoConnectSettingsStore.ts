import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_CONNECT_MASTER_KEY = 'obd_auto_connect_master_enabled';

interface ObdAutoConnectSettingsState {
  enabled: boolean;
  loadSaved: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
}

// Rà soát 30/7 (user: mở app đôi khi chỉ để làm việc khác, không phải lúc nào
// cũng muốn bị auto-connect OBD2 mời kết nối) - công tắc TOÀN CỤC, tách biệt
// hẳn với autoConnect theo từng xe (pairedDevices.ts -> setAutoConnect). Bật/
// tắt riêng theo xe vẫn giữ nguyên (vd tắt cho xe phụ, bật cho xe chính) -
// công tắc này chỉ là 1 lớp chặn TRÊN CÙNG: tắt là ObdAutoConnect không tự
// thử bất kỳ xe nào nữa, dù xe đó đã bật autoConnect riêng. Mặc định BẬT (giữ
// nguyên hành vi hiện tại cho user chưa từng đụng tới cài đặt này).
export const useObdAutoConnectSettingsStore = create<ObdAutoConnectSettingsState>((set) => ({
  enabled: true,
  loadSaved: async () => {
    const saved = await AsyncStorage.getItem(AUTO_CONNECT_MASTER_KEY).catch(() => null);
    if (saved === '0') set({ enabled: false });
  },
  setEnabled: (enabled) => {
    set({ enabled });
    AsyncStorage.setItem(AUTO_CONNECT_MASTER_KEY, enabled ? '1' : '0').catch(() => {});
  },
}));
