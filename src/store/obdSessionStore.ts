import { create } from 'zustand';

/**
 * Trạng thái phiên OBD TOÀN CỤC (C5 tầng 1): nguồn sự thật cho thẻ Home,
 * thẻ màn chi tiết xe và banner mini - kết nối không còn "tàng hình" khi
 * rời Dashboard. BleService cập nhật connected/reconnecting/deviceName;
 * useObd cập nhật vehicleId/vehicleName.
 */
type ObdSessionState = {
  connected: boolean;
  reconnecting: boolean;
  vehicleId: number | null;
  vehicleName: string | null;
  deviceName: string | null;
  patch: (p: Partial<Omit<ObdSessionState, 'patch' | 'clear'>>) => void;
  clear: () => void;
};

export const useObdSessionStore = create<ObdSessionState>((set) => ({
  connected: false,
  reconnecting: false,
  vehicleId: null,
  vehicleName: null,
  deviceName: null,
  patch: (p) => set(p),
  clear: () =>
    set({
      connected: false,
      reconnecting: false,
      vehicleId: null,
      vehicleName: null,
      deviceName: null,
    }),
}));
