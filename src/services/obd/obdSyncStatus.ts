import { flushPendingObdSessions, pendingObdSessionCount } from './ObdSessionSyncQueue';
import { flushPendingDtcReports, flushPendingDtcResolves, pendingDtcReportCount, pendingDtcResolveCount } from './ObdDtcSyncQueue';
import { useObdSessionStore } from '../../store/obdSessionStore';

/**
 * Badge "còn N mục chờ đồng bộ" trên Home (HomeScreen.tsx, icon OBD2): đọc lại
 * số dư của 3 hàng đợi OBD offline và ghi vào obdSessionStore - gọi ở đúng các
 * điểm đã flush sẵn (không thêm poll loop mới).
 */
export async function refreshPendingSyncCount(): Promise<void> {
  const [sessions, dtcReports, dtcResolves] = await Promise.all([
    pendingObdSessionCount(),
    pendingDtcReportCount(),
    pendingDtcResolveCount(),
  ]);
  useObdSessionStore.getState().patch({ pendingSyncCount: sessions + dtcReports + dtcResolves });
}

export async function flushObdQueuesAndRefreshCount(): Promise<{ sessionsSynced: number }> {
  const [sessionResult] = await Promise.all([
    flushPendingObdSessions().catch(() => ({ synced: 0, failed: 0 })),
    flushPendingDtcReports().catch(() => ({ synced: 0, failed: 0 })),
    flushPendingDtcResolves().catch(() => ({ synced: 0, failed: 0 })),
  ]);
  await refreshPendingSyncCount();
  return { sessionsSynced: sessionResult.synced };
}
