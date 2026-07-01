import AsyncStorage from '@react-native-async-storage/async-storage';
import { gpsTripsApi } from '../../api/gpsTrips';
import { GpsTripSummary } from './GpsTripTracker';

const KEY = 'gps_pending_trips';

type PendingTrip = GpsTripSummary & { retries: number; queuedAt: string };

async function readQueue(): Promise<PendingTrip[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingTrip[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function enqueueTrip(summary: GpsTripSummary): Promise<void> {
  const queue = await readQueue();
  if (queue.length >= 30) queue.shift();
  queue.push({ ...summary, retries: 0, queuedAt: new Date().toISOString() });
  await writeQueue(queue);
}

export async function flushPendingGpsTrips(): Promise<{ synced: number; failed: number }> {
  const queue = await readQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  const remaining: PendingTrip[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await gpsTripsApi.saveTrip(item);
      synced++;
    } catch {
      item.retries++;
      if (item.retries < 5) remaining.push(item);
      failed++;
    }
  }

  await writeQueue(remaining);
  return { synced, failed };
}

export async function pendingGpsCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}
