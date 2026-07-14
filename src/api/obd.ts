import client from './client';
import { TripSummary } from '../services/obd/TripSession';

export type ObdTripRecord = {
  id: number;
  vehicle_id: number;
  started_at: string;
  ended_at: string;
  distance_km: number;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  avg_engine_load_pct: number | null;
  avg_coolant_temp_c: number | null;
  fuel_level_start_pct: number | null;
  fuel_level_end_pct: number | null;
  idle_time_seconds: number;
  driving_time_seconds: number;
  obd_device_id: string | null;
};

export type DtcEventRecord = {
  id: number;
  vehicle_id: number;
  code: string;
  description: string | null;
  is_resolved: boolean;
  detected_at: string;
  resolved_at: string | null;
};

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
  load_avg: number | null;
  speed_max: number | null;
  dtc_count: number;
  findings: string[];
};

export type ObdSessionRecord = {
  id: number;
  device_name: string | null;
  connected_at: string;
  duration_seconds: number;
  summary: ObdSessionSummary;
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

  resolveDtc: (dtcEventId: number) =>
    client.post(`/obd2/dtc/${dtcEventId}/resolve`),

  // Tra cứu tay 1 mã lỗi từ từ điển server (route Free, không cần thiết bị OBD)
  lookupDtc: (code: string) =>
    client.get<{ data: DtcLookupResult }>(`/dtc-codes/${encodeURIComponent(code)}`),

  // Báo mã lỗi phát hiện LIVE (không qua chuyến - GPS là nguồn chuyến duy nhất từ 14/7)
  reportDtc: (vehicleId: number, codes: Array<{ code: string; description: string | null }>) =>
    client.post('/obd2/dtc', { vehicle_id: vehicleId, codes }),

  // Lịch sử phiên gần nhất (đã có summary) cho Daily Report - app tự đánh giá
  recentSessions: (vehicleId: number) =>
    client.get<{ data: ObdSessionRecord[] }>('/obd2/sessions/recent', { params: { vehicle_id: vehicleId } }),

  // Telemetry retention: 1 dòng mỗi phiên kết nối đã kết thúc (fire-and-forget)
  reportSession: (payload: {
    vehicle_id: number;
    device_name: string | null;
    connected_at: string;
    duration_seconds: number;
    summary?: Record<string, unknown> | null;
  }) => client.post('/obd2/sessions', payload),
};
