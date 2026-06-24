import * as SecureStore from 'expo-secure-store';
import { obdApi } from '../../api/obd';
import { TripSummary } from './TripSession';

const QUEUE_KEY = 'obd_pending_trips';

// Strip raw snapshots before persisting — they are not sent to the API and
// can easily exceed SecureStore's ~2 KB per-key limit on iOS, causing a
// silent write failure that loses the entire queue.
type StorableSummary = Omit<TripSummary, 'snapshots'>;

type PendingTrip = {
  summary: StorableSummary;
  deviceId: string | null;
  queuedAt: string;
  retries: number;
};

function stripSnapshots(summary: TripSummary): StorableSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { snapshots: _snapshots, ...rest } = summary;
  return rest;
}

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
    // Storage full or unavailable - drop silently rather than crashing
  }
}

export async function enqueueTripSync(
  summary: TripSummary,
  deviceId: string | null
): Promise<void> {
  const queue = await readQueue();

  // Cap at 30 trips (~30 × ~300 bytes = ~9 KB total, well within SecureStore)
  if (queue.length >= 30) queue.shift();

  queue.push({
    summary: stripSnapshots(summary),
    deviceId,
    queuedAt: new Date().toISOString(),
    retries: 0,
  });

  await writeQueue(queue);
}

export async function flushPendingTrips(): Promise<{ synced: number; failed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  const remaining: PendingTrip[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      // obdApi.saveTrip accepts a StorableSummary - snapshots field is optional
      await obdApi.saveTrip(item.summary as TripSummary, item.deviceId);
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

export async function pendingCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}
