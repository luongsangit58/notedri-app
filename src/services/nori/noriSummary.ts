import { useQuery } from '@tanstack/react-query';
import { vehiclesApi } from '../../api/vehicles';
import { obdApi } from '../../api/obd';
import { groupSessionsByDay, compareWeeks, WeekComparison } from '../obd/sessionTrend';
import { noriMoodFromScore, NoriMood } from './nori';

// Cùng 30 ngày ObdReportScreen.tsx đang dùng (TREND_DAYS) - queryKey khớp hệt để
// dùng chung cache react-query, không bắn thêm request nếu user đã mở màn đó.
const HISTORY_DAYS = 30;

export interface NoriDrivingStats {
  avg_score: number;
  trend: 'up' | 'down' | 'stable' | null;
  sessions_counted: number;
  harsh_brake_total: number;
  harsh_accel_total: number;
}

export interface NoriSummary {
  isLoading: boolean;
  mood: NoriMood;
  /** Nhãn organ urgent/warn nổi bật nhất hôm nay, null nếu không có */
  topIssueLabel: string | null;
  /** So sánh 7 ngày gần nhất với 7 ngày trước đó - null nếu chưa đủ 14 ngày dữ liệu */
  weekComparison: WeekComparison | null;
  /** Điểm lái xe TB + xu hướng 10 phiên gần nhất - backend đã tính sẵn (recentSessions) */
  drivingStats: NoriDrivingStats | null;
}

/**
 * Tổng hợp dữ liệu cho Nori (icon nổi + popover): tái dùng ĐÚNG 3 nguồn dữ liệu
 * đã có sẵn trong app (health, recentSessions, historySessions) - không tính
 * toán phân tích mới, không gọi API mới. Dùng chung queryKey với HealthScreen/
 * ObdReportScreen nên không tốn thêm round-trip nếu user đã từng mở 2 màn đó.
 */
export function useNoriSummary(vehicleId: number | undefined): NoriSummary {
  const enabled = !!vehicleId;

  const { data: healthRaw, isLoading: healthLoading } = useQuery({
    queryKey: ['vehicles', vehicleId, 'health'],
    queryFn: () => vehiclesApi.health(vehicleId!).then((r) => r.data),
    enabled,
    retry: 1,
  });

  const { data: recentRaw, isLoading: recentLoading } = useQuery({
    queryKey: ['obd', 'sessions-recent', vehicleId],
    queryFn: () => obdApi.recentSessions(vehicleId!).then((r) => r.data),
    enabled,
    retry: 1,
  });

  const { data: historyRaw, isLoading: historyLoading } = useQuery({
    queryKey: ['obd', 'sessions-history', vehicleId, HISTORY_DAYS],
    queryFn: () => obdApi.historySessions(vehicleId!, HISTORY_DAYS).then((r) => r.data),
    enabled,
    retry: 1,
  });

  const health: any = healthRaw?.data ?? healthRaw ?? null;
  const total: number | null = health?.score?.total ?? (health?.health_score != null ? Number(health.health_score) : null);
  const organs: any[] = Array.isArray(health?.organs) ? health.organs : [];
  const hasUrgentOrgan = organs.some((o) => o.status === 'urgent');
  const hasWarnOrgan = organs.some((o) => o.status === 'warn');
  const topIssue = organs.find((o) => o.status === 'urgent') ?? organs.find((o) => o.status === 'warn');

  const isLoading = healthLoading || recentLoading || historyLoading;
  const mood: NoriMood = isLoading ? 'unknown' : noriMoodFromScore(total, hasUrgentOrgan, hasWarnOrgan);

  const sessions = historyRaw?.data ?? [];
  const weekComparison = compareWeeks(groupSessionsByDay(sessions, HISTORY_DAYS));

  return {
    isLoading,
    mood,
    topIssueLabel: topIssue?.label ?? null,
    weekComparison,
    drivingStats: recentRaw?.meta?.driving_score_stats ?? null,
  };
}
