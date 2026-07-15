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
  /** Tổng giờ máy chạy trong ngày (h, 1 số lẻ) */
  engineHours: number | null;
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
      points.push({ date, voltageAvg: null, coolantMax: null, drivingScore: null, dtcCount: null, engineHours: null });
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
      engineHours: runSeconds > 0 ? Number((runSeconds / 3600).toFixed(1)) : null,
    });
  }
  return points;
}
