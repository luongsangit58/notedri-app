import {
  detectDrivingEvents,
  computeDrivingScoreByDistance,
  computeDrivingScoreByDuration,
  scoreFromCounts,
  nightDrivingRatio,
  idleDrivingPenalty,
  computeSessionScore,
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

describe('scoreFromCounts', () => {
  it('phanh gấp bị phạt nặng hơn tăng tốc gấp (trọng số 1.5 vs 1)', () => {
    const brakeOnly = scoreFromCounts(2, 0, 10);
    const accelOnly = scoreFromCounts(0, 2, 10);
    expect(brakeOnly).toBeLessThan(accelOnly);
  });
});

describe('computeDrivingScoreByDistance', () => {
  it('2 lần phanh gấp trên 10km -> trừ 30 điểm (trọng số 1.5/sự kiện)', () => {
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
    expect(result.score).toBe(70);
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

describe('nightDrivingRatio', () => {
  it('toàn bộ mẫu vào khung giờ đêm (23h-5h) -> tỉ lệ 1', () => {
    const midnight = new Date(2026, 0, 1, 0, 0, 0).getTime();
    const ratio = nightDrivingRatio([
      { ts: midnight, speedKmh: 40 },
      { ts: midnight + 5000, speedKmh: 42 },
      { ts: midnight + 10000, speedKmh: 41 },
    ]);
    expect(ratio).toBe(1);
  });

  it('toàn bộ mẫu ban ngày -> tỉ lệ 0', () => {
    const noon = new Date(2026, 0, 1, 12, 0, 0).getTime();
    const ratio = nightDrivingRatio([
      { ts: noon, speedKmh: 40 },
      { ts: noon + 5000, speedKmh: 42 },
    ]);
    expect(ratio).toBe(0);
  });

  it('không có mẫu hợp lệ (dưới 2 mẫu) -> tỉ lệ 0', () => {
    expect(nightDrivingRatio([{ ts: 0, speedKmh: 40 }])).toBe(0);
    expect(nightDrivingRatio([])).toBe(0);
  });
});

describe('idleDrivingPenalty', () => {
  it('idle dưới ngưỡng 30% (đèn đỏ/kẹt xe bình thường) -> không phạt', () => {
    expect(idleDrivingPenalty(200, 800)).toBe(0); // idle 20%
  });

  it('idle 100% (máy nổ, không hề di chuyển) -> phạt tối đa', () => {
    expect(idleDrivingPenalty(600, 0)).toBe(10);
  });

  it('idle vượt ngưỡng một phần -> phạt tỉ lệ thuận', () => {
    // idle 65%: (0.65-0.3)/(1-0.3) = 0.5 -> phạt 5/10 điểm
    expect(idleDrivingPenalty(650, 350)).toBe(5);
  });

  it('không có thời gian nào -> không phạt (tránh chia cho 0)', () => {
    expect(idleDrivingPenalty(0, 0)).toBe(0);
  });
});

describe('computeSessionScore', () => {
  it('gộp phạt sự kiện + đêm + idle thành 1 điểm 0-100, không âm', () => {
    const score = computeSessionScore({
      harshBrakeCount: 5, harshAccelCount: 5, unitsTravelled: 1,
      nightDrivingRatio: 1, idleSeconds: 600, drivingSeconds: 0,
    });
    expect(score).toBe(0);
  });

  it('không có sự kiện/đêm/idle -> điểm tối đa 100', () => {
    expect(computeSessionScore({ harshBrakeCount: 0, harshAccelCount: 0, unitsTravelled: 10 })).toBe(100);
  });

  it('bỏ qua phạt idle khi thiếu dữ liệu OBD (chỉ GPS)', () => {
    const withoutIdleData = computeSessionScore({ harshBrakeCount: 0, harshAccelCount: 0, unitsTravelled: 10, nightDrivingRatio: 0 });
    expect(withoutIdleData).toBe(100);
  });
});
