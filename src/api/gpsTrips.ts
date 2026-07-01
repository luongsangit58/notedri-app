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
  },
};
