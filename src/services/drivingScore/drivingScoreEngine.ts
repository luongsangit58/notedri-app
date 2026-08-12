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
 *
 * Rà soát bổ sung: ngoài đếm sự kiện phanh gấp/tăng tốc gấp (trọng số khác
 * nhau, xem HARSH_BRAKE_WEIGHT/HARSH_ACCEL_WEIGHT), điểm còn bị trừ thêm cho
 * (1) tỉ lệ thời gian lái vào khung giờ đêm (nightDrivingRatio) và (2) tỉ lệ
 * idle vượt ngưỡng bình thường khi có dữ liệu OBD (idleDrivingPenalty). Xem
 * computeSessionScore() để biết cách 3 khoản này gộp lại thành 1 điểm 0-100.
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

// Trọng số phanh gấp nặng hơn tăng tốc gấp: dữ liệu ngành (va chạm đuôi xe
// thường bắt nguồn từ phanh gấp/thiếu khoảng cách an toàn) cho rủi ro va chạm
// cao hơn tăng tốc gấp (chủ yếu hao nhiên liệu/mài mòn). Cũng là số BETA như 2
// ngưỡng m/s² ở trên - cần hiệu chỉnh cùng đợt khi có dữ liệu thật.
export const HARSH_BRAKE_WEIGHT = 1.5;
export const HARSH_ACCEL_WEIGHT = 1;

// Khung giờ đêm 23h-5h - dải giờ tai nạn có tỉ lệ tử vong cao hơn theo thống kê
// giao thông (buồn ngủ/tầm nhìn kém), không phải "lái xấu" theo hành vi tức
// thời như 2 sự kiện trên nhưng vẫn là yếu tố rủi ro đáng phạt nhẹ.
export const NIGHT_START_HOUR = 23;
export const NIGHT_END_HOUR = 5;
// Điểm trừ tối đa nếu 100% thời gian lái rơi vào khung giờ đêm.
export const NIGHT_DRIVING_MAX_PENALTY = 10;

// Idle (máy nổ, xe đứng yên) dưới ngưỡng này là bình thường (đèn đỏ, kẹt xe) -
// chỉ phạt phần VƯỢT ngưỡng, và chỉ áp dụng được cho nguồn OBD (có rpm) vì GPS
// thuần không biết máy có đang nổ hay không lúc xe đứng yên.
export const IDLE_RATIO_THRESHOLD = 0.3;
export const IDLE_MAX_PENALTY = 10;

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

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
  const weightedTotal = harshBrakeCount * HARSH_BRAKE_WEIGHT + harshAccelCount * HARSH_ACCEL_WEIGHT;
  if (unitsTravelled <= 0) return weightedTotal > 0 ? 0 : 100;
  const eventsPer10Units = (weightedTotal / unitsTravelled) * 10;
  return Math.max(0, Math.min(100, Math.round(100 - eventsPer10Units * 10)));
}

/**
 * Tỉ lệ (0-1) thời gian lái rơi vào khung giờ đêm (NIGHT_START_HOUR-
 * NIGHT_END_HOUR), suy từ mốc thời gian của chính các mẫu tốc độ - không cần
 * nguồn dữ liệu mới. Dùng chung logic loại gap nền với detectDrivingEvents để
 * khoảng trống mất sóng không bị tính nhầm là thời gian lái đêm/ngày.
 */
export function nightDrivingRatio(samples: SpeedSample[]): number {
  const sorted = [...samples].sort((a, b) => a.ts - b.ts);
  let nightMs = 0;
  let totalMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dtMs = sorted[i].ts - sorted[i - 1].ts;
    const dtSec = dtMs / 1000;
    if (dtSec <= 0 || dtSec > MAX_GAP_SECONDS) continue;
    totalMs += dtMs;
    if (isNightHour(new Date(sorted[i - 1].ts).getHours())) nightMs += dtMs;
  }
  return totalMs > 0 ? nightMs / totalMs : 0;
}

/** Điểm trừ (0-IDLE_MAX_PENALTY) cho phần tỉ lệ idle VƯỢT NGƯỠNG bình thường. */
export function idleDrivingPenalty(idleSeconds: number, drivingSeconds: number): number {
  const totalSeconds = idleSeconds + drivingSeconds;
  if (totalSeconds <= 0) return 0;
  const idleRatio = idleSeconds / totalSeconds;
  if (idleRatio <= IDLE_RATIO_THRESHOLD) return 0;
  const excessRatio = (idleRatio - IDLE_RATIO_THRESHOLD) / (1 - IDLE_RATIO_THRESHOLD);
  return Math.round(excessRatio * IDLE_MAX_PENALTY);
}

export type SessionScoreParams = {
  harshBrakeCount: number;
  harshAccelCount: number;
  /** km (GPS trip) hoặc phút (phiên OBD) - xem scoreFromCounts. */
  unitsTravelled: number;
  /** 0-1, bỏ qua (không phạt) nếu không truyền. */
  nightDrivingRatio?: number;
  /** Chỉ nguồn OBD có cả 2 - GPS thuần không biết máy có nổ khi xe đứng yên. */
  idleSeconds?: number;
  drivingSeconds?: number;
};

/** Điểm 0-100 tổng hợp: base (harsh brake/accel) trừ thêm phạt đêm + idle. */
export function computeSessionScore(p: SessionScoreParams): number {
  let score = scoreFromCounts(p.harshBrakeCount, p.harshAccelCount, p.unitsTravelled);
  if (p.nightDrivingRatio) score -= Math.round(p.nightDrivingRatio * NIGHT_DRIVING_MAX_PENALTY);
  if (p.idleSeconds !== undefined && p.drivingSeconds !== undefined) {
    score -= idleDrivingPenalty(p.idleSeconds, p.drivingSeconds);
  }
  return Math.max(0, Math.min(100, score));
}

/** Dùng cho GPS trip (đã có distanceKm, xem RoutePoint[] -> SpeedSample[]). */
export function computeDrivingScoreByDistance(
  events: DrivingEvent[],
  distanceKm: number,
  samples: SpeedSample[] = []
): DrivingScoreResult {
  const { harshBrakeCount, harshAccelCount } = countByType(events);
  const score = computeSessionScore({
    harshBrakeCount, harshAccelCount, unitsTravelled: distanceKm,
    nightDrivingRatio: nightDrivingRatio(samples),
  });
  return { harshBrakeCount, harshAccelCount, score };
}

/** Dùng cho phiên OBD (không có quãng đường, chỉ có thời lượng phiên). */
export function computeDrivingScoreByDuration(
  events: DrivingEvent[],
  durationMinutes: number,
  samples: SpeedSample[] = []
): DrivingScoreResult {
  const { harshBrakeCount, harshAccelCount } = countByType(events);
  const score = computeSessionScore({
    harshBrakeCount, harshAccelCount, unitsTravelled: durationMinutes,
    nightDrivingRatio: nightDrivingRatio(samples),
  });
  return { harshBrakeCount, harshAccelCount, score };
}
