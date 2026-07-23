import client from './client';
import { TripSummary } from '../services/obd/TripSyncQueue';

export type DtcLookupResult = {
  code: string;
  known: boolean;
  group?: string | null;
  severity?: 'critical' | 'warn' | 'info' | null;
  can_drive?: 'yes' | 'caution' | 'stop' | null;
  title_vi?: string | null;
  title_en?: string | null;
  action_vi?: string | null;
  cost_min?: number | null;
  cost_max?: number | null;
};

export type ObdSessionSummary = {
  samples: number;
  coolant_max: number | null;
  coolant_min: number | null;
  voltage_min: number | null;
  voltage_max: number | null;
  voltage_avg: number | null;
  rpm_idle_avg: number | null;
  // Optional: phiên lưu trước khi thêm 2 trường này sẽ không có key - fallback
  // undefined phải xử lý như null (xem sessionReport.evaluateSession).
  rpm_avg?: number | null;
  throttle_idle_avg?: number | null;
  load_avg: number | null;
  speed_max: number | null;
  dtc_count: number;
  findings: string[];
  // Optional: phiên lưu trước 14/7 (chấm điểm lái xe) sẽ không có 3 key này.
  harsh_brake_count?: number;
  harsh_accel_count?: number;
  driving_score?: number;
  // Optional: giây máy chạy thật (E5 core) - phiên cũ không có, fallback duration.
  engine_run_seconds?: number;
  // Optional: khoảng trống nền (fixture #5, obdLiveMonitor) - phiên cũ không có.
  background_gap_count?: number;
  background_gap_seconds_total?: number;
  // Optional: PID 5E (rà soát 23/7) - phiên cũ (trước khi thêm tầng slow đọc
  // fuel rate) không có 2 key này.
  fuel_rate_avg?: number | null;
  fuel_used_liters_est?: number | null;
};

export type ObdSessionRecord = {
  id: number;
  device_name: string | null;
  connected_at: string;
  duration_seconds: number;
  summary: ObdSessionSummary;
};

// Payload gửi POST /obd2/sessions. idempotency_key sinh ở ObdSessionSyncQueue lúc
// enqueue, gửi lại y nguyên mỗi lần retry -> server không tạo phiên trùng.
export type ObdSessionPayload = {
  vehicle_id: number;
  device_name: string | null;
  connected_at: string;
  duration_seconds: number;
  summary?: Record<string, unknown> | null;
  idempotency_key: string;
};

export const obdApi = {
  saveTrip: (summary: TripSummary, deviceId: string | null) =>
    client.post('/obd2/trips', {
      vehicle_id:            summary.vehicleId,
      started_at:            summary.startedAt,
      ended_at:              summary.endedAt,
      distance_km:           summary.distanceKm,
      avg_speed_kmh:         summary.avgSpeedKmh,
      max_speed_kmh:         summary.maxSpeedKmh,
      avg_engine_load_pct:   summary.avgEngineLoad,
      avg_coolant_temp_c:    summary.avgCoolantTemp,
      fuel_level_start_pct:  summary.fuelLevelStart,
      fuel_level_end_pct:    summary.fuelLevelEnd,
      idle_time_seconds:     summary.idleTimeSeconds,
      driving_time_seconds:  summary.drivingTimeSeconds,
      obd_device_id:         deviceId,
      dtc_codes:             summary.dtcCodes,
    }),

  trips: (vehicleId: number, page = 1) =>
    client.get('/obd2/trips', { params: { vehicle_id: vehicleId, page } }),

  dtcEvents: (vehicleId: number) =>
    client.get('/obd2/dtc', { params: { vehicle_id: vehicleId } }),

  // Tra cứu tay 1 mã lỗi từ từ điển server (route Free, không cần thiết bị OBD)
  lookupDtc: (code: string) =>
    client.get<{ data: DtcLookupResult }>(`/dtc-codes/${encodeURIComponent(code)}`),

  // Báo mã lỗi phát hiện LIVE (không qua chuyến - GPS là nguồn chuyến duy nhất từ 14/7)
  reportDtc: (vehicleId: number, codes: Array<{ code: string; description: string | null }>) =>
    client.post('/obd2/dtc', { vehicle_id: vehicleId, codes }),

  // Lịch sử phiên gần nhất (đã có summary) cho Daily Report - app tự đánh giá.
  // meta.total_engine_hours (C1): tổng giờ máy tích luỹ mọi phiên.
  // meta.driving_score_stats (rà soát 16/7): điểm lái xe TB 10 phiên gần nhất +
  // xu hướng - null nếu xe chưa có phiên nào tính được điểm (xem Vehicle::drivingScoreStats()).
  recentSessions: (vehicleId: number) =>
    client.get<{
      data: ObdSessionRecord[];
      meta?: {
        total_engine_hours: number;
        driving_score_stats: {
          avg_score: number;
          trend: 'up' | 'down' | 'stable' | null;
          sessions_counted: number;
          harsh_brake_total: number;
          harsh_accel_total: number;
        } | null;
      };
    }>('/obd2/sessions/recent', { params: { vehicle_id: vehicleId } }),

  // E2: toàn bộ phiên trong N ngày (cũ->mới) cho biểu đồ xu hướng - app tự gộp
  // theo ngày LỊCH của máy user (server gộp theo UTC sẽ lệch ngày ở VN +7).
  historySessions: (vehicleId: number, days = 30) =>
    client.get<{ data: ObdSessionRecord[]; meta?: { days: number } }>(
      '/obd2/sessions/history', { params: { vehicle_id: vehicleId, days } }),

  // Telemetry retention: 1 dòng mỗi phiên kết nối đã kết thúc. Gọi qua
  // ObdSessionSyncQueue (enqueue + flush) - đừng gọi thẳng, mất phiên khi offline.
  reportSession: (payload: ObdSessionPayload) => client.post('/obd2/sessions', payload),
};
