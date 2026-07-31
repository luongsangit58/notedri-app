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
  // Optional: Readiness (Mode 01 PID 01, đọc 1 lần/phiên) - phiên cũ không có
  // 3 key này. State cuối phiên (không phải trung bình/tích luỹ).
  mil_on?: boolean | null;
  readiness_ready_count?: number | null;
  readiness_supported_count?: number | null;
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

  // Khoá MỀM theo vehicle_id (29/7, rà soát "2 máy cùng account, cùng xe, cùng
  // lúc kết nối OBD"): dùng vehicle_id (đã có sẵn trong DB, luôn đáng tin) thay
  // vì VIN - VIN đọc qua PID 0902 không phải ECU nào cũng trả (một số xe không
  // hỗ trợ), nên không thể làm điều kiện chặn/cảnh báo chính. Khác hẳn
  // gpsTripsApi.trackingLock (khoá CỨNG, claim() throw 409): claim() ở đây
  // KHÔNG BAO GIỜ chặn kết nối - server chỉ trả về ai đang giữ (nếu có) để FE
  // tự hiện banner "xe này đang được máy khác dùng", user tự quyết định.
  // Response 200 luôn (không 409) với shape:
  //   { locked_by_other: boolean, held_by_device_name?: string, held_since?: string }
  //
  // Rà soát 30/7: không còn wrapper `renew` (PUT) riêng - endpoint đó CHỈ trả
  // {"message":"ok"}, không có locked_by_other (xem ObdDeviceLockController::
  // renew() phía BE), nên không dùng để tự cập nhật banner "xe đang dùng máy
  // khác" được. useObd.ts heartbeat giờ gọi lại claim() (POST) mỗi 90s thay
  // renew() - BE cố ý cho phép "reclaim" qua claim() khi chính máy này đang
  // giữ, vừa gia hạn TTL vừa trả đúng thông tin chia sẻ mới nhất.
  deviceLock: {
    claim: (vehicleId: number, deviceId: string, deviceName: string) =>
      client.post<{ locked_by_other: boolean; held_by_device_name?: string; held_since?: string }>(
        '/obd2/device-lock', { vehicle_id: vehicleId, device_id: deviceId, device_name: deviceName },
      ),
    release: (vehicleId: number, deviceId: string) =>
      client.delete('/obd2/device-lock', { data: { vehicle_id: vehicleId, device_id: deviceId } }),
  },
};
