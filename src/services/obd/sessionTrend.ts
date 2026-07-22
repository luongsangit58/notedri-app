import dayjs, { Dayjs } from 'dayjs';
import { ObdSessionRecord } from '../../api/obd';

/**
 * Gộp phiên OBD theo ngày LỊCH cho biểu đồ xu hướng (E2). Hàm thuần - không import
 * React Native để test được bằng jest không cần mock (cùng nguyên tắc obdParser.ts).
 *
 * Ngày KHÔNG có phiên nào -> mọi chỉ số = null, KHÔNG phải 0: bar chart vẽ 0 sẽ
 * đọc nhầm thành "điện áp 0V/coolant 0°C hôm đó" - null để UI vẽ dạng "không đo".
 */

export type DailyTrendPoint = {
  /** YYYY-MM-DD theo giờ máy user */
  date: string;
  /** Điện áp trung bình các phiên trong ngày (V) */
  voltageAvg: number | null;
  /** Coolant CAO NHẤT trong ngày (°C) - đỉnh mới là thứ đáng lo, không phải trung bình */
  coolantMax: number | null;
  /** Điểm lái xe trung bình trong ngày (0-100) */
  drivingScore: number | null;
  /** Tổng số mã lỗi DTC các phiên trong ngày */
  dtcCount: number | null;
  /** Tổng thời gian máy chạy trong ngày (PHÚT, số nguyên) - không dùng giờ ở
   * biểu đồ xu hướng: phiên test/đi lại ngắn thường chỉ vài phút, làm tròn 1 số
   * lẻ theo GIỜ (VD 0.0333h) mất hết độ phân giải, hiển thị "0h" dù có dữ liệu
   * thật (phản hồi 15/7). Tổng tích luỹ nhiều phiên/bảo dưỡng vẫn tính theo giờ
   * ở nơi khác (ObdReportScreen tab "Phiên gần nhất") - phút chỉ dùng cho trục
   * thời gian ngắn (theo ngày) của riêng biểu đồ này. */
  engineMinutes: number | null;
};

export type TrendMetric = Exclude<keyof DailyTrendPoint, 'date'>;

const avg = (xs: number[]): number | null =>
  xs.length ? Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)) : null;

/**
 * Trả về đúng `days` phần tử, cũ -> mới, phần tử cuối = hôm nay. Phiên ngoài dải
 * (server trả dư/lệch múi giờ) bị bỏ qua thay vì làm lệch trục.
 */
export function groupSessionsByDay(
  sessions: ObdSessionRecord[],
  days: number,
  today: Dayjs = dayjs(),
): DailyTrendPoint[] {
  const byDate = new Map<string, ObdSessionRecord[]>();
  for (const s of sessions) {
    const d = dayjs(s.connected_at).format('YYYY-MM-DD');
    const bucket = byDate.get(d);
    if (bucket) bucket.push(s);
    else byDate.set(d, [s]);
  }

  const points: DailyTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = today.subtract(i, 'day').format('YYYY-MM-DD');
    const bucket = byDate.get(date);
    if (!bucket) {
      points.push({ date, voltageAvg: null, coolantMax: null, drivingScore: null, dtcCount: null, engineMinutes: null });
      continue;
    }

    const voltages = bucket.map((s) => s.summary.voltage_avg).filter((v): v is number => v != null);
    const coolants = bucket.map((s) => s.summary.coolant_max).filter((v): v is number => v != null);
    const scores = bucket.map((s) => s.summary.driving_score).filter((v): v is number => v != null);
    // dtc_count là field bắt buộc trong summary; engine_run_seconds optional (phiên cũ)
    const dtcTotal = bucket.reduce((a, s) => a + (s.summary.dtc_count ?? 0), 0);
    const runSeconds = bucket.reduce((a, s) => a + (s.summary.engine_run_seconds ?? 0), 0);

    points.push({
      date,
      voltageAvg: avg(voltages),
      coolantMax: coolants.length ? Math.max(...coolants) : null,
      drivingScore: scores.length ? Math.round(avg(scores)!) : null,
      dtcCount: dtcTotal,
      engineMinutes: runSeconds > 0 ? Math.round(runSeconds / 60) : null,
    });
  }
  return points;
}

export type WeekAggregate = {
  /** Điểm lái xe TB trong tuần - null nếu không có phiên nào tính được điểm */
  avgDrivingScore: number | null;
  /** Tổng mã lỗi DTC phát hiện trong tuần */
  totalDtc: number;
  /** Tổng số phút nổ máy trong tuần */
  totalEngineMinutes: number;
  /** Số ngày trong tuần có ít nhất 1 phiên kết nối OBD2 */
  sessionDays: number;
};

export type WeekComparison = {
  thisWeek: WeekAggregate;
  prevWeek: WeekAggregate;
  /** thisWeek - prevWeek; null nếu 1 trong 2 tuần chưa có phiên nào tính được điểm lái xe */
  drivingScoreDelta: number | null;
};

function weekAggregate(points: DailyTrendPoint[]): WeekAggregate {
  // dtcCount chỉ null khi KHÔNG có phiên nào ngày đó (groupSessionsByDay), khác
  // biệt với drivingScore/voltageAvg có thể null dù CÓ phiên (thiếu field trong
  // summary) - dùng dtcCount làm tín hiệu "ngày này có phiên" đáng tin cậy nhất.
  const daysWithSession = points.filter((p) => p.dtcCount != null).length;
  const scores = points.map((p) => p.drivingScore).filter((v): v is number => v != null);
  return {
    avgDrivingScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    totalDtc: points.reduce((a, p) => a + (p.dtcCount ?? 0), 0),
    totalEngineMinutes: points.reduce((a, p) => a + (p.engineMinutes ?? 0), 0),
    sessionDays: daysWithSession,
  };
}

/**
 * So sánh 7 ngày gần nhất với 7 ngày liền trước, dựa trên `DailyTrendPoint[]` đã
 * gộp sẵn (không gọi API riêng - dùng lại đúng `historySessions()` mà ObdReportScreen
 * đã fetch, xem noriSummary.ts). Cần ít nhất 14 điểm (7+7); ít hơn thì chưa đủ dữ
 * liệu để so sánh có ý nghĩa -> trả null thay vì so sánh nửa vời.
 */
export function compareWeeks(points: DailyTrendPoint[]): WeekComparison | null {
  if (points.length < 14) return null;
  const last14 = points.slice(-14);
  const prevWeek = weekAggregate(last14.slice(0, 7));
  const thisWeek = weekAggregate(last14.slice(7, 14));
  const drivingScoreDelta = thisWeek.avgDrivingScore != null && prevWeek.avgDrivingScore != null
    ? thisWeek.avgDrivingScore - prevWeek.avgDrivingScore
    : null;
  return { thisWeek, prevWeek, drivingScoreDelta };
}
