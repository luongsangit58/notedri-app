import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_CONNECT_MASTER_KEY = 'obd_auto_connect_master_enabled';

interface ObdAutoConnectSettingsState {
  enabled: boolean;
  // Chặn TẠM THỜI trong phiên app hiện tại (KHÔNG lưu AsyncStorage - cố ý, để
  // tự hết hiệu lực khi user tắt hẳn app rồi mở lại). User vừa CHỦ ĐỘNG bấm
  // "Ngắt kết nối" trên Dashboard (xong hành trình, muốn dừng hẳn) -> không
  // được để ObdAutoConnect mời nối lại ngay khi họ quay về Home/đổi màn hình
  // trong CÙNG phiên. Khác với `enabled` (công tắc user tự bật/tắt ở Cài đặt,
  // có chủ đích lâu dài) - cờ này chỉ là ý định tức thời của 1 lần ngắt.
  sessionSuppressed: boolean;
  loadSaved: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  suppressForSession: () => void;
  clearSessionSuppression: () => void;
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
  sessionSuppressed: false,
  loadSaved: async () => {
    const saved = await AsyncStorage.getItem(AUTO_CONNECT_MASTER_KEY).catch(() => null);
    if (saved === '0') set({ enabled: false });
  },
  setEnabled: (enabled) => {
    set({ enabled });
    AsyncStorage.setItem(AUTO_CONNECT_MASTER_KEY, enabled ? '1' : '0').catch(() => {});
    // Import động - tránh vòng phụ thuộc tĩnh (autoWakeSync.ts đọc lại state
    // của chính store này). Tắt công tắc tổng phải xoá cache native ngay (tắt
    // tính năng "tự thức app" tương ứng), không chỉ chặn ở tầng JS.
    import('../services/obd/autoWakeSync').then((m) => m.syncAutoWakeDevices()).catch(() => {});
  },
  suppressForSession: () => set({ sessionSuppressed: true }),
  clearSessionSuppression: () => set({ sessionSuppressed: false }),
}));
