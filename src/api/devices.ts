import client from './client';
import { deviceMeta } from './auth';

export type DeviceSession = {
  id: number;
  device_id: string;
  device_name: string;
  platform: 'ios' | 'android' | 'unknown';
  is_gps_primary: boolean;
  is_current: boolean;
  is_online: boolean;
  last_seen_at: string | null;
};

export const devicesApi = {
  list: () => client.get<{ data: DeviceSession[] }>('/device-sessions'),
  logout: (id: number) => client.delete(`/device-sessions/${id}`),
  logoutAll: () => client.delete('/device-sessions/all'),
  setPrimary: (id: number) => client.patch(`/device-sessions/${id}/primary`),
  // Gửi kèm device meta -> backend UPSERT (tạo row nếu thiết bị chưa có, vd user đã login từ trước).
  heartbeat: async () => {
    const meta = await deviceMeta();
    return client.post('/device-sessions/heartbeat', meta);
  },
};

/** Gọi heartbeat an toàn (bỏ qua lỗi) - dùng lúc mở app / quay lại foreground / sau login. */
export function sendDeviceHeartbeat(): void {
  devicesApi.heartbeat().catch(() => {});
}
