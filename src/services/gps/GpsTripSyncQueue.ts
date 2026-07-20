import { gpsTripsApi } from '../../api/gpsTrips';
import { GpsTripSummary } from './GpsTripTracker';
import { createSyncQueue } from '../syncQueue';

const queue = createSyncQueue<GpsTripSummary>({
  key: 'gps_pending_trips',
  cap: 30,
  send: (item) => gpsTripsApi.saveTrip(item),
});

export const enqueueTrip = queue.enqueue;
export const flushPendingGpsTrips = queue.flush;
export const pendingGpsCount = queue.count;
/** Xoá sạch hàng đợi (gọi khi logout để không đẩy chuyến của user cũ sang tài khoản mới). */
export const clearGpsQueue = queue.clear;
