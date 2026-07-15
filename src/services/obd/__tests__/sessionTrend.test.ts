import dayjs from 'dayjs';
import { groupSessionsByDay } from '../sessionTrend';
import { ObdSessionRecord } from '../../../api/obd';

const TODAY = dayjs('2026-07-15T12:00:00');

function session(connectedAt: string, summary: Partial<ObdSessionRecord['summary']> = {}): ObdSessionRecord {
  return {
    id: Math.floor(Math.random() * 100000),
    device_name: 'IOS-Vlink',
    connected_at: connectedAt,
    duration_seconds: 1800,
    summary: {
      samples: 100,
      coolant_max: 84,
      coolant_min: 48,
      voltage_min: 13.9,
      voltage_max: 14.5,
      voltage_avg: 14.3,
      rpm_idle_avg: 750,
      load_avg: 45,
      speed_max: 60,
      dtc_count: 0,
      findings: [],
      ...summary,
    },
  };
}

describe('groupSessionsByDay - gộp phiên theo ngày lịch cho biểu đồ E2', () => {
  it('luôn trả về đúng `days` phần tử, cũ -> mới, phần tử cuối = hôm nay', () => {
    const points = groupSessionsByDay([], 7, TODAY);
    expect(points).toHaveLength(7);
    expect(points[0].date).toBe('2026-07-09');
    expect(points[6].date).toBe('2026-07-15');
  });

  it('ngày KHÔNG có phiên -> mọi chỉ số null, KHÔNG phải 0 (0V/0°C là số đo sai)', () => {
    const points = groupSessionsByDay([session('2026-07-15T08:00:00')], 3, TODAY);
    const empty = points[0]; // 13/7 không có phiên
    expect(empty.voltageAvg).toBeNull();
    expect(empty.coolantMax).toBeNull();
    expect(empty.drivingScore).toBeNull();
    expect(empty.dtcCount).toBeNull();
    expect(empty.engineHours).toBeNull();
  });

  it('ngày có 1 phiên: lấy thẳng số liệu phiên đó', () => {
    const points = groupSessionsByDay(
      [session('2026-07-15T08:00:00', { voltage_avg: 14.2, coolant_max: 88, driving_score: 95, dtc_count: 1, engine_run_seconds: 1800 })],
      1,
      TODAY,
    );
    expect(points[0]).toEqual({
      date: '2026-07-15',
      voltageAvg: 14.2,
      coolantMax: 88,
      drivingScore: 95,
      dtcCount: 1,
      engineHours: 0.5,
    });
  });

  it('ngày có 2+ phiên: voltage/score trung bình, coolant lấy MAX, dtc/giờ máy CỘNG', () => {
    const points = groupSessionsByDay(
      [
        session('2026-07-15T08:00:00', { voltage_avg: 14.0, coolant_max: 84, driving_score: 90, dtc_count: 1, engine_run_seconds: 1800 }),
        session('2026-07-15T18:00:00', { voltage_avg: 14.4, coolant_max: 90, driving_score: 100, dtc_count: 2, engine_run_seconds: 3600 }),
      ],
      1,
      TODAY,
    );
    expect(points[0].voltageAvg).toBe(14.2);
    expect(points[0].coolantMax).toBe(90);
    expect(points[0].drivingScore).toBe(95);
    expect(points[0].dtcCount).toBe(3);
    expect(points[0].engineHours).toBe(1.5);
  });

  it('phiên cũ thiếu field optional (driving_score, engine_run_seconds) -> null thay vì NaN', () => {
    const points = groupSessionsByDay([session('2026-07-15T08:00:00')], 1, TODAY);
    expect(points[0].drivingScore).toBeNull();
    expect(points[0].engineHours).toBeNull();
    // dtc_count là field bắt buộc -> 0 thật (xe không lỗi), không phải null
    expect(points[0].dtcCount).toBe(0);
  });

  it('phiên ngoài dải ngày (server trả dư) bị bỏ qua, không làm lệch trục', () => {
    const points = groupSessionsByDay(
      [session('2026-06-01T08:00:00', { voltage_avg: 9.9 })],
      7,
      TODAY,
    );
    expect(points.every((p) => p.voltageAvg === null)).toBe(true);
  });

  it('voltage_avg null trong summary (phiên xe không hỗ trợ PID 42) không kéo trung bình về 0', () => {
    const points = groupSessionsByDay(
      [
        session('2026-07-15T08:00:00', { voltage_avg: null }),
        session('2026-07-15T18:00:00', { voltage_avg: 14.4 }),
      ],
      1,
      TODAY,
    );
    expect(points[0].voltageAvg).toBe(14.4);
  });
});
