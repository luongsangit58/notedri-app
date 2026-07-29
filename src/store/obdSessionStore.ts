import { create } from 'zustand';

/**
 * Trạng thái phiên OBD TOÀN CỤC (C5 tầng 1): nguồn sự thật cho thẻ Home,
 * thẻ màn chi tiết xe và banner mini - kết nối không còn "tàng hình" khi
 * rời Dashboard. BleService cập nhật connected/reconnecting/deviceName;
 * useObd cập nhật vehicleId/vehicleName.
 */
export type LastSessionSaved = {
  samples: number;
  durationSeconds: number;
  drivingScore: number | null;
  ts: number;
};

type ObdSessionState = {
  connected: boolean;
  reconnecting: boolean;
  vehicleId: number | null;
  vehicleName: string | null;
  deviceName: string | null;
  // Rà soát 16/7: user không có phản hồi nào khi phiên kết thúc là dữ liệu đã
  // được tổng hợp/lưu hay chưa - obdLiveMonitor patch field này NGAY lúc ngắt
  // (đồng bộ, từ buildSessionSummary() đã có sẵn) để banner hiện toast xác nhận,
  // tách khỏi việc enqueue/flush lên server chạy async phía sau.
  lastSessionSaved: LastSessionSaved | null;
  // Khoá MỀM theo vehicle_id (29/7): xe này đang được 1 máy KHÁC (cùng account
  // hoặc khác) giữ kết nối OBD tại thời điểm claim gần nhất - CHỈ để cảnh báo,
  // không chặn kết nối của máy này (xem obdApi.deviceLock, useObd.ts).
  sharedByOtherDevice: { deviceName: string; since: string | null } | null;
  patch: (p: Partial<Omit<ObdSessionState, 'patch' | 'clear'>>) => void;
  clear: () => void;
};

export const useObdSessionStore = create<ObdSessionState>((set) => ({
  connected: false,
  reconnecting: false,
  vehicleId: null,
  vehicleName: null,
  deviceName: null,
  lastSessionSaved: null,
  sharedByOtherDevice: null,
  patch: (p) => set(p),
  clear: () =>
    set({
      connected: false,
      reconnecting: false,
      vehicleId: null,
      vehicleName: null,
      deviceName: null,
      sharedByOtherDevice: null,
    }),
}));
