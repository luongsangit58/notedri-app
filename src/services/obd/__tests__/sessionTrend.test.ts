import dayjs from 'dayjs';
import { groupSessionsByDay, compareWeeks, DailyTrendPoint } from '../sessionTrend';
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
    expect(empty.engineMinutes).toBeNull();
    expect(empty.fuelUsedLiters).toBeNull();
  });

  it('ngày có 1 phiên: lấy thẳng số liệu phiên đó', () => {
    const points = groupSessionsByDay(
      [session('2026-07-15T08:00:00', {
        voltage_avg: 14.2, coolant_max: 88, driving_score: 95, dtc_count: 1,
        engine_run_seconds: 1800, fuel_used_liters_est: 0.8,
      })],
      1,
      TODAY,
    );
    expect(points[0]).toEqual({
      date: '2026-07-15',
      voltageAvg: 14.2,
      coolantMax: 88,
      drivingScore: 95,
      dtcCount: 1,
      engineMinutes: 30,
      fuelUsedLiters: 0.8,
    });
  });

  it('ngày có 2+ phiên: voltage/score trung bình, coolant lấy MAX, dtc/phút máy CỘNG', () => {
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
    expect(points[0].engineMinutes).toBe(90);
  });

  it('phiên rất ngắn (<30s máy chạy) -> làm tròn 0 phút THẬT, khác null (phản hồi 15/7: "0h" trước đây nuốt mất dữ liệu thật do làm tròn theo giờ)', () => {
    const points = groupSessionsByDay(
      [session('2026-07-15T08:00:00', { engine_run_seconds: 18 })],
      1,
      TODAY,
    );
    expect(points[0].engineMinutes).toBe(0);
  });

  it('phiên cũ thiếu field optional (driving_score, engine_run_seconds) -> null thay vì NaN', () => {
    const points = groupSessionsByDay([session('2026-07-15T08:00:00')], 1, TODAY);
    expect(points[0].drivingScore).toBeNull();
    expect(points[0].engineMinutes).toBeNull();
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

// Điểm giả cho compareWeeks - không cần đi qua groupSessionsByDay/session(), test
// thẳng trên DailyTrendPoint[] vì đó là ranh giới input thật của hàm.
function point(overrides: Partial<DailyTrendPoint> = {}): DailyTrendPoint {
  return {
    date: '2026-01-01', voltageAvg: null, coolantMax: null, drivingScore: null,
    dtcCount: null, engineMinutes: null, fuelUsedLiters: null, ...overrides,
  };
}
function noSessionDay(): DailyTrendPoint {
  return point(); // dtcCount null = không có phiên nào ngày đó
}
function sessionDay(overrides: Partial<DailyTrendPoint> = {}): DailyTrendPoint {
  return point({ dtcCount: 0, engineMinutes: 20, drivingScore: 80, voltageAvg: 14.2, coolantMax: 85, ...overrides });
}

describe('compareWeeks - so sánh 7 ngày gần nhất với 7 ngày liền trước', () => {
  it('trả null nếu chưa đủ 14 điểm (chưa đủ dữ liệu để so sánh có ý nghĩa)', () => {
    const points = Array.from({ length: 13 }, () => sessionDay());
    expect(compareWeeks(points)).toBeNull();
  });

  it('chỉ dùng ĐÚNG 14 điểm cuối (7 tuần trước + 7 tuần này), bỏ qua phần cũ hơn', () => {
    const older = Array.from({ length: 10 }, () => sessionDay({ drivingScore: 0 })); // sẽ bị cắt bỏ
    const prevWeek = Array.from({ length: 7 }, () => sessionDay({ drivingScore: 60 }));
    const thisWeek = Array.from({ length: 7 }, () => sessionDay({ drivingScore: 90 }));
    const result = compareWeeks([...older, ...prevWeek, ...thisWeek]);
    expect(result?.prevWeek.avgDrivingScore).toBe(60);
    expect(result?.thisWeek.avgDrivingScore).toBe(90);
  });

  it('tính đúng điểm lái xe TB, tổng DTC, tổng phút máy, số ngày có phiên mỗi tuần', () => {
    const prevWeek = [
      sessionDay({ drivingScore: 70, dtcCount: 1, engineMinutes: 30 }),
      sessionDay({ drivingScore: 90, dtcCount: 0, engineMinutes: 15 }),
      ...Array.from({ length: 5 }, () => noSessionDay()),
    ];
    const thisWeek = [
      sessionDay({ drivingScore: 95, dtcCount: 0, engineMinutes: 40 }),
      ...Array.from({ length: 6 }, () => noSessionDay()),
    ];
    const result = compareWeeks([...prevWeek, ...thisWeek])!;
    expect(result.prevWeek).toEqual({ avgDrivingScore: 80, totalDtc: 1, totalEngineMinutes: 45, sessionDays: 2 });
    expect(result.thisWeek).toEqual({ avgDrivingScore: 95, totalDtc: 0, totalEngineMinutes: 40, sessionDays: 1 });
  });

  it('drivingScoreDelta = tuần này - tuần trước', () => {
    const prevWeek = [sessionDay({ drivingScore: 70 }), ...Array.from({ length: 6 }, () => noSessionDay())];
    const thisWeek = [sessionDay({ drivingScore: 85 }), ...Array.from({ length: 6 }, () => noSessionDay())];
    const result = compareWeeks([...prevWeek, ...thisWeek]);
    expect(result?.drivingScoreDelta).toBe(15);
  });

  it('drivingScoreDelta null nếu 1 trong 2 tuần không có phiên nào tính được điểm', () => {
    const prevWeek = Array.from({ length: 7 }, () => noSessionDay());
    const thisWeek = [sessionDay({ drivingScore: 85 }), ...Array.from({ length: 6 }, () => noSessionDay())];
    const result = compareWeeks([...prevWeek, ...thisWeek]);
    expect(result?.drivingScoreDelta).toBeNull();
    expect(result?.prevWeek.avgDrivingScore).toBeNull();
  });

  it('tuần hoàn toàn không có phiên nào -> avgDrivingScore null, tổng = 0, sessionDays = 0', () => {
    const points = Array.from({ length: 14 }, () => noSessionDay());
    const result = compareWeeks(points)!;
    expect(result.prevWeek).toEqual({ avgDrivingScore: null, totalDtc: 0, totalEngineMinutes: 0, sessionDays: 0 });
    expect(result.thisWeek).toEqual({ avgDrivingScore: null, totalDtc: 0, totalEngineMinutes: 0, sessionDays: 0 });
  });
});
