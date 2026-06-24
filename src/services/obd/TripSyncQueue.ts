import * as SecureStore from 'expo-secure-store';
import { obdApi } from '../../api/obd';
import { TripSummary } from './TripSession';

const QUEUE_KEY = 'obd_pending_trips';

type PendingTrip = {
  summary: TripSummary;
  deviceId: string | null;
  queuedAt: string;
  retries: number;
};

async function readQueue(): Promise<PendingTrip[]> {
  try {
    const raw = await SecureStore.getItemAsync(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeQueue(queue: PendingTrip[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // storage full or unavailable - drop silently
  }
}

export async function enqueueTripSync(
  summary: TripSummary,
  deviceId: string | null
): Promise<void> {
  const queue = await readQueue();

  // Cap queue at 50 trips to avoid storage bloat
  if (queue.length >= 50) queue.shift();

  queue.push({
    summary,
    deviceId,
    queuedAt: new Date().toISOString(),
    retries: 0,
  });

  await writeQueue(queue);
}

// Call this on app foreground / after network restored
export async function flushPendingTrips(): Promise<{ synced: number; failed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: PendingTrip[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await obdApi.saveTrip(item.summary, item.deviceId);
      synced++;
    } catch {
      item.retries++;
      // Drop after 5 retries (trip older than several days)
      if (item.retries < 5) {
        remaining.push(item);
      }
      failed++;
    }
  }

  await writeQueue(remaining);
  return { synced, failed };
}

export async function pendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}
