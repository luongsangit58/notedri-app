import client from './client';
import { GpsTripSummary, RoutePoint } from '../services/gps/GpsTripTracker';

export type GpsTripRecord = {
  id: number;
  vehicle_id: number;
  started_at: string;
  ended_at: string;
  distance_km: number;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  idle_time_seconds: number;
  driving_time_seconds: number;
  route_points: RoutePoint[] | null;
  ghi_chu: string | null;
  start_address: string | null;
  end_address: string | null;
};

export const gpsTripsApi = {
  saveTrip: (summary: GpsTripSummary) =>
    client.post('/gps/trips', {
      vehicle_id:           summary.vehicleId,
      started_at:           summary.startedAt,
      ended_at:             summary.endedAt,
      distance_km:          summary.distanceKm,
      avg_speed_kmh:        summary.avgSpeedKmh,
      max_speed_kmh:        summary.maxSpeedKmh,
      idle_time_seconds:    summary.idleTimeSeconds,
      driving_time_seconds: summary.drivingTimeSeconds,
      route_points:         summary.routePoints,
      ghi_chu:              summary.ghiChu ?? null,
    }),

  trips: (vehicleId: number, page = 1) =>
    client.get<{ data: GpsTripRecord[]; meta: { last_page: number } }>('/gps/trips', {
      params: { vehicle_id: vehicleId, page },
    }),

  // Chuyến GPS trong 1 khoảng thời gian (rà soát 4/8) - dùng để hiện hành trình
  // "song hành" với 1 phiên OBD cụ thể trên ObdSessionDetailScreen, KHÔNG phải nguồn
  // sự thật mới (GPS vẫn là nguồn CHUYẾN ĐI duy nhất, OBD vẫn độc lập - xem useObd.ts).
  tripsInRange: (vehicleId: number, sinceIso: string, untilIso: string) =>
    client.get<{ data: GpsTripRecord[] }>('/gps/trips', {
      params: { vehicle_id: vehicleId, since: sinceIso, until: untilIso },
    }),

  updateNote: (id: number, ghi_chu: string) =>
    client.patch(`/gps/trips/${id}`, { ghi_chu }),

  remove: (id: number) =>
    client.delete(`/gps/trips/${id}`),

  trackingLock: {
    claim: (vehicleId: number, deviceId: string) =>
      client.post('/gps/tracking-lock', { vehicle_id: vehicleId, device_id: deviceId }),
    release: (vehicleId: number, deviceId: string) =>
      client.delete('/gps/tracking-lock', { data: { vehicle_id: vehicleId, device_id: deviceId } }),
    renew: (vehicleId: number, deviceId: string) =>
      client.put('/gps/tracking-lock', { vehicle_id: vehicleId, device_id: deviceId }),
    // Máy nào đang THỰC SỰ giữ lock cho xe này (29/7) - dùng để đồng bộ
    // GpsPrimaryBanner với sự thật thay vì is_gps_primary (per-user, không
    // theo xe - xem comment ở GpsTripsScreen.tsx).
    status: (vehicleId: number) =>
      client.get<{ holder_device_id: string | null; holder_device_name: string | null }>(
        '/gps/tracking-lock/status', { params: { vehicle_id: vehicleId } },
      ),
  },
};
