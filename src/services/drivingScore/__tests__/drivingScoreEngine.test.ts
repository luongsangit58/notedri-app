import {
  detectDrivingEvents,
  computeDrivingScoreByDistance,
  computeDrivingScoreByDuration,
} from '../drivingScoreEngine';

describe('detectDrivingEvents', () => {
  it('phanh gấp: 60 -> 20 km/h trong 2s (~-5.56 m/s²) vượt ngưỡng -3.4', () => {
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 60 },
      { ts: 2000, speedKmh: 20 },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('harsh_brake');
    expect(events[0].ms2).toBeCloseTo(-5.556, 2);
  });

  it('tăng tốc đột ngột: 0 -> 40 km/h trong 2s (~5.56 m/s²) vượt ngưỡng 2.94', () => {
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 0 },
      { ts: 2000, speedKmh: 40 },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('harsh_accel');
  });

  it('giảm tốc bình thường (60 -> 55 trong 3s, ~-0.46 m/s²) KHÔNG báo sự kiện', () => {
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 60 },
      { ts: 3000, speedKmh: 55 },
    ]);
    expect(events).toHaveLength(0);
  });

  it('khoảng cách 2 mẫu > 10s (mất sóng/app đóng băng nền) KHÔNG được tính là sự kiện thật', () => {
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 60 },
      { ts: 15000, speedKmh: 0 }, // giảm tốc "ảo" do khoảng trống, không phải phanh gấp thật
    ]);
    expect(events).toHaveLength(0);
  });

  it('tự sắp xếp lại mẫu không theo thứ tự thời gian', () => {
    const events = detectDrivingEvents([
      { ts: 2000, speedKmh: 20 },
      { ts: 0, speedKmh: 60 },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('harsh_brake');
  });
});

describe('computeDrivingScoreByDistance', () => {
  it('2 sự kiện trên 10km -> trừ 20 điểm', () => {
    // Hồi tốc giữa 2 lần phanh gấp phải đủ CHẬM (dt=4s cho 38km/h, ~2.64 m/s² <
    // ngưỡng 2.94) để không vô tình sinh thêm 1 sự kiện harsh_accel thứ 3.
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 60 }, { ts: 2000, speedKmh: 20 },
      { ts: 6000, speedKmh: 58 }, { ts: 8000, speedKmh: 60 },
      { ts: 10000, speedKmh: 60 }, { ts: 12000, speedKmh: 20 },
    ]);
    expect(events.map((e) => e.type)).toEqual(['harsh_brake', 'harsh_brake']);
    const result = computeDrivingScoreByDistance(events, 10);
    expect(result.harshBrakeCount).toBe(2);
    expect(result.score).toBe(80);
  });

  it('không có sự kiện nào -> điểm tối đa 100', () => {
    const result = computeDrivingScoreByDistance([], 20);
    expect(result.score).toBe(100);
  });

  it('distanceKm = 0 nhưng có sự kiện -> điểm thấp nhất 0 (tránh chia cho 0)', () => {
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 60 }, { ts: 2000, speedKmh: 20 },
    ]);
    const result = computeDrivingScoreByDistance(events, 0);
    expect(result.score).toBe(0);
  });
});

describe('computeDrivingScoreByDuration', () => {
  it('1 sự kiện trong 30 phút -> trừ ít điểm hơn (mật độ thấp)', () => {
    const events = detectDrivingEvents([
      { ts: 0, speedKmh: 60 }, { ts: 2000, speedKmh: 20 },
    ]);
    const result = computeDrivingScoreByDuration(events, 30);
    expect(result.harshBrakeCount).toBe(1);
    expect(result.score).toBeGreaterThan(90);
    expect(result.score).toBeLessThan(100);
  });
});
