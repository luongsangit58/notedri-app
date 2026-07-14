/**
 * Chấm điểm lái xe (Driving Score) - checklist Giai đoạn G, thiết kế trong
 * _bmad-output/driving-score-design-proposal-2026-07-14.md. Hàm THUẦN (không
 * RN/DB/BLE/GPS import) - test độc lập được, dùng chung cho 2 nguồn:
 *
 * - OBD: tốc độ ECU (PID 0D) đã được `obdLiveMonitor` đọc mỗi 3s cho tính năng
 *   live-monitor sẵn có - KHÔNG tốn thêm pin.
 * - GPS: `route_points` đã được `GpsTripTracker` lưu mỗi 5s cho MỌI chuyến từ
 *   trước tới giờ - KHÔNG tốn thêm pin, tính lại lúc hiển thị (không cần đổi
 *   gì ở backend/tần suất lấy mẫu).
 *
 * Engine không quan tâm nguồn, chỉ cần dãy {ts, speedKmh} theo thời gian.
 *
 * Ngưỡng (mục 3 tài liệu thiết kế, nguồn US DOT/Verizon Connect/Geotab/MiX
 * Telematics): CHƯA có fixture thật để hiệu chỉnh - giữ tinh thần "rule beta"
 * của Diagnostic Rule Engine, sẽ tinh chỉnh khi có dữ liệu thật (xem mục 5).
 */

export type SpeedSample = { ts: number; speedKmh: number };

export type DrivingEvent = {
  type: 'harsh_brake' | 'harsh_accel';
  at: number;
  ms2: number; // gia tốc quan sát được (âm = giảm tốc), đơn vị m/s²
  fromKmh: number;
  toKmh: number;
};

// ~0.35g - thận trọng hơn dải ngành 0.3-0.5g vì mẫu GPS/tốc độ OBD nhiễu hơn
// accelerometer thật (xem mục 3 tài liệu thiết kế 14/7).
export const HARSH_BRAKE_MS2 = 3.4;
// ~0.3g
export const HARSH_ACCEL_MS2 = 2.94;

// Khoảng cách giữa 2 mẫu quá lớn (mất sóng/app bị đóng băng ở nền - đúng bài
// học fixture #5 của BLE) không được tính là 1 sự kiện thật.
const MAX_GAP_SECONDS = 10;

/** Phát hiện sự kiện phanh gấp/tăng tốc đột ngột từ dãy mẫu tốc độ theo thời gian. */
export function detectDrivingEvents(samples: SpeedSample[]): DrivingEvent[] {
  const events: DrivingEvent[] = [];
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const dtSec = (cur.ts - prev.ts) / 1000;
    if (dtSec <= 0 || dtSec > MAX_GAP_SECONDS) continue;

    const dvMs = (cur.speedKmh - prev.speedKmh) / 3.6;
    const ms2 = dvMs / dtSec;

    if (ms2 <= -HARSH_BRAKE_MS2) {
      events.push({ type: 'harsh_brake', at: cur.ts, ms2, fromKmh: prev.speedKmh, toKmh: cur.speedKmh });
    } else if (ms2 >= HARSH_ACCEL_MS2) {
      events.push({ type: 'harsh_accel', at: cur.ts, ms2, fromKmh: prev.speedKmh, toKmh: cur.speedKmh });
    }
  }

  return events;
}

export type DrivingScoreResult = {
  harshBrakeCount: number;
  harshAccelCount: number;
  /** 0-100, THAM KHẢO - công thức chưa hiệu chỉnh bằng dữ liệu thật, xem mục 5 tài liệu thiết kế. */
  score: number;
};

function countByType(events: DrivingEvent[]): { harshBrakeCount: number; harshAccelCount: number } {
  return {
    harshBrakeCount: events.filter((e) => e.type === 'harsh_brake').length,
    harshAccelCount: events.filter((e) => e.type === 'harsh_accel').length,
  };
}

/**
 * Điểm 0-100 từ SỐ ĐẾM sự kiện + đơn vị di chuyển (km hoặc phút) - tách riêng
 * khỏi countByType/events để `obdLiveMonitor` có thể tích luỹ đếm số sự kiện
 * DẦN THEO TỪNG POLL (như các Agg khác trong file đó) mà KHÔNG cần giữ lại
 * toàn bộ mảng mẫu tốc độ của cả phiên trong bộ nhớ.
 *
 * Đếm sự kiện/10 đơn vị thay vì đếm tuyệt đối để đơn vị di chuyển dài hơn
 * không bị thiệt hơn đơn vị ngắn cùng mức độ lái. Hệ số -10 điểm/sự kiện-trên-
 * 10-đơn-vị là ước tính ban đầu CHƯA hiệu chỉnh bằng dữ liệu thật (mục 5 tài
 * liệu thiết kế).
 */
export function scoreFromCounts(harshBrakeCount: number, harshAccelCount: number, unitsTravelled: number): number {
  const total = harshBrakeCount + harshAccelCount;
  if (unitsTravelled <= 0) return total > 0 ? 0 : 100;
  const eventsPer10Units = (total / unitsTravelled) * 10;
  return Math.max(0, Math.min(100, Math.round(100 - eventsPer10Units * 10)));
}

/** Dùng cho GPS trip (đã có distanceKm, xem RoutePoint[] -> SpeedSample[]). */
export function computeDrivingScoreByDistance(events: DrivingEvent[], distanceKm: number): DrivingScoreResult {
  const { harshBrakeCount, harshAccelCount } = countByType(events);
  return { harshBrakeCount, harshAccelCount, score: scoreFromCounts(harshBrakeCount, harshAccelCount, distanceKm) };
}

/** Dùng cho phiên OBD (không có quãng đường, chỉ có thời lượng phiên). */
export function computeDrivingScoreByDuration(events: DrivingEvent[], durationMinutes: number): DrivingScoreResult {
  const { harshBrakeCount, harshAccelCount } = countByType(events);
  return { harshBrakeCount, harshAccelCount, score: scoreFromCounts(harshBrakeCount, harshAccelCount, durationMinutes) };
}
