import { obdApi } from '../../api/obd';
import { bleService } from './BleService';
import {
  readSnapshot,
  readDtcCodes,
  reinitElm327AfterReconnect,
  ObdSnapshot,
  DtcCode,
} from './ObdReader';
import { evaluate, Finding } from './diagnosticEngine';
import { getActiveRules, refreshRulesFromServer } from './diagnosticRulesStore';
import { useObdSessionStore } from '../../store/obdSessionStore';

/**
 * Live monitor OBD (quyết định 14/7: GPS là nguồn CHUYẾN ĐI duy nhất - fixture #5
 * chứng minh JS timer bị OS đóng băng khi app vào nền nên quãng đường OBD tích
 * phân theo nhịp poll sai không cứu được). Monitor này thay obdTripManager:
 * KHÔNG còn khái niệm chuyến - chỉ poll số liệu sống + canh DTC + chạy rule
 * engine trong suốt thời gian kết nối, sống theo phiên BLE chứ không theo màn hình.
 *
 * DTC phát hiện live được báo thẳng POST /obd2/dtc (trước kia DTC chỉ lên server
 * kèm storeTrip - bỏ trip mà không có kênh này là mất chẩn đoán).
 */

const POLL_INTERVAL_MS = 3000;
const DTC_EVERY_N_POLLS = 100; // ~5 phút

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let skipBeat = false;
let pollCount = 0;
let activeVehicleId: number | null = null;
let reportedCodes = new Set<string>();

// E1 - Session Timeline: tích luỹ thống kê chuẩn hoá trong phiên, gửi kèm
// telemetry khi phiên kết thúc (trước đây snapshot hiển thị xong là VỨT -
// không có ký ức giữa các phiên thì không bao giờ làm được trend analysis).
type Agg = { sum: number; n: number; min: number; max: number };
const newAgg = (): Agg => ({ sum: 0, n: 0, min: Infinity, max: -Infinity });
let aggCoolant = newAgg();
let aggVoltage = newAgg();
let aggLoad = newAgg();
let aggIdleRpm = newAgg(); // rpm khi xe đứng yên
// rpm TOÀN phiên (mọi tốc độ) - cần cho rule chỉ đòi hỏi "máy đang chạy" (sạc
// điện, van hằng nhiệt): dùng riêng aggIdleRpm cho các rule đó sẽ khiến chúng bị
// BỎ QUA oan trên 1 chuyến chạy thuần cao tốc không hề dừng đèn đỏ (rpm_idle_avg
// null dù voltage/coolant vẫn có đủ dữ liệu để đánh giá) - phát hiện 14/7.
let aggRpmAll = newAgg();
let aggIdleThrottle = newAgg(); // throttle khi xe đứng yên - cho rule high-idle-warm ở Daily Report
let maxSpeed: number | null = null;
let sessionDtcCount = 0;
let sessionFindingIds = new Set<string>();

function feed(agg: Agg, v: number | null): void {
  if (v === null) return;
  agg.sum += v; agg.n += 1;
  if (v < agg.min) agg.min = v;
  if (v > agg.max) agg.max = v;
}

function resetSessionStats(): void {
  aggCoolant = newAgg(); aggVoltage = newAgg(); aggLoad = newAgg(); aggIdleRpm = newAgg();
  aggRpmAll = newAgg(); aggIdleThrottle = newAgg();
  maxSpeed = null; sessionDtcCount = 0; sessionFindingIds = new Set();
}

/** Snapshot chuẩn hoá cuối phiên - null khi phiên không có dữ liệu nào. */
export function buildSessionSummary(): Record<string, unknown> | null {
  if (aggCoolant.n === 0 && aggVoltage.n === 0 && aggIdleRpm.n === 0 && aggRpmAll.n === 0) return null;
  const avg = (a: Agg, digits = 0) => (a.n ? Number((a.sum / a.n).toFixed(digits)) : null);
  return {
    samples: pollCount,
    coolant_max: aggCoolant.n ? aggCoolant.max : null,
    coolant_min: aggCoolant.n ? aggCoolant.min : null,
    voltage_min: aggVoltage.n ? Number(aggVoltage.min.toFixed(2)) : null,
    voltage_max: aggVoltage.n ? Number(aggVoltage.max.toFixed(2)) : null,
    voltage_avg: avg(aggVoltage, 2),
    rpm_idle_avg: avg(aggIdleRpm),
    rpm_avg: avg(aggRpmAll),
    throttle_idle_avg: avg(aggIdleThrottle),
    load_avg: avg(aggLoad),
    speed_max: maxSpeed,
    dtc_count: sessionDtcCount,
    findings: [...sessionFindingIds],
  };
}

const snapshotListeners = new Set<(s: ObdSnapshot) => void>();
const dtcListeners = new Set<(codes: DtcCode[]) => void>();
const findingListeners = new Set<(findings: Finding[]) => void>();

async function poll(): Promise<void> {
  if (inFlight || !bleService.isConnected()) return;

  // Sóng kém → thưa nửa nhịp (ý #16)
  if (bleService.getLinkQuality() === 'poor') {
    skipBeat = !skipBeat;
    if (skipBeat) return;
  } else {
    skipBeat = false;
  }

  inFlight = true;
  try {
    pollCount += 1;
    const snapshot = await readSnapshot();
    snapshotListeners.forEach((fn) => fn(snapshot));

    // E1: tích luỹ thống kê phiên
    feed(aggCoolant, snapshot.coolantTempC);
    feed(aggVoltage, snapshot.controlModuleVoltage);
    feed(aggLoad, snapshot.engineLoadPct);
    feed(aggRpmAll, snapshot.rpm);
    if (snapshot.speedKmh !== null) {
      if (maxSpeed === null || snapshot.speedKmh > maxSpeed) maxSpeed = snapshot.speedKmh;
      if (snapshot.speedKmh === 0) {
        feed(aggIdleRpm, snapshot.rpm);
        feed(aggIdleThrottle, snapshot.throttlePct);
      }
    }

    // Rule engine trên từng snapshot (hàm thuần, rẻ)
    const findings = evaluate(getActiveRules(), {
      rpm: snapshot.rpm,
      speedKmh: snapshot.speedKmh,
      engineLoadPct: snapshot.engineLoadPct,
      coolantTempC: snapshot.coolantTempC,
      throttlePct: snapshot.throttlePct,
      controlModuleVoltage: snapshot.controlModuleVoltage,
      sessionAgeSeconds: bleService.getSessionAgeSeconds(),
    });
    findingListeners.forEach((fn) => fn(findings));
    findings.forEach((f) => sessionFindingIds.add(f.ruleId));

    // DTC: sớm ở vòng 2 rồi mỗi ~5 phút
    if (pollCount === 2 || pollCount % DTC_EVERY_N_POLLS === 0) {
      const codes = await readDtcCodes();
      if (codes.length > 0) {
        sessionDtcCount = codes.length;
        dtcListeners.forEach((fn) => fn(codes));
        // Báo server các mã CHƯA báo trong phiên này (fire-and-forget)
        const fresh = codes.filter((c) => !reportedCodes.has(c.code));
        if (fresh.length > 0 && activeVehicleId) {
          fresh.forEach((c) => reportedCodes.add(c.code));
          obdApi.reportDtc(activeVehicleId, fresh).catch(() => {});
        }
      }
    }
  } catch {
    // Poll lỗi thoáng qua - bỏ qua, vòng sau thử lại
  } finally {
    inFlight = false;
  }
}

export const obdLiveMonitor = {
  isRunning(): boolean {
    return timer !== null;
  },

  getVehicleId(): number | null {
    return activeVehicleId;
  },

  /** Bắt đầu theo phiên kết nối - gọi sau khi connect thành công. */
  start(vehicleId: number): void {
    if (timer) {
      // Đổi xe giữa chừng (hiếm): coi như phiên MỚI cho xe mới - phải reset TOÀN
      // BỘ thống kê tích luỹ (không chỉ reportedCodes), nếu không coolant/voltage/
      // idle-rpm/findings đang tích cho xe CŨ sẽ bị báo cáo nhầm gắn vào lịch sử
      // của xe MỚI khi phiên kết thúc (buildSessionSummary không phân biệt xe).
      if (activeVehicleId !== vehicleId) {
        reportedCodes = new Set();
        pollCount = 0;
        resetSessionStats();
      }
      activeVehicleId = vehicleId;
      return;
    }
    activeVehicleId = vehicleId;
    pollCount = 0;
    reportedCodes = new Set();
    resetSessionStats();
    // Tải rule mới nhất đúng lúc sắp dùng - không chặn vòng poll đầu tiên
    refreshRulesFromServer().catch(() => {});
    timer = setInterval(() => void poll(), POLL_INTERVAL_MS);
  },

  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    activeVehicleId = null;
  },

  onSnapshot(fn: (s: ObdSnapshot) => void): () => void {
    snapshotListeners.add(fn);
    return () => snapshotListeners.delete(fn);
  },

  onDtcFound(fn: (codes: DtcCode[]) => void): () => void {
    dtcListeners.add(fn);
    return () => dtcListeners.delete(fn);
  },

  onFindings(fn: (findings: Finding[]) => void): () => void {
    findingListeners.add(fn);
    return () => findingListeners.delete(fn);
  },
};

// ---- Đăng ký 1 lần ở module level: chạy dù không màn hình nào mở ----

// Adapter thường tự reboot khi rớt (fixture #5) → nắn lại cài đặt ELM sau reconnect
bleService.addReconnectedListener(() => {
  reinitElm327AfterReconnect().catch(() => {});
});

bleService.addDisconnectListener(() => {
  // Telemetry retention (ý #14): đọc vehicleId TRƯỚC khi store bị clear
  // (BleService fire listener trước rồi mới clear); consumeSessionInfo đọc-rồi-xoá.
  const info = bleService.consumeSessionInfo();
  const vehicleId = useObdSessionStore.getState().vehicleId;
  if (info && vehicleId) {
    obdApi.reportSession({
      vehicle_id: vehicleId,
      device_name: info.deviceName,
      connected_at: new Date(info.startedAt).toISOString(),
      duration_seconds: Math.max(0, Math.round((Date.now() - info.startedAt) / 1000)),
      summary: buildSessionSummary(),
    }).catch(() => {});
  }

  obdLiveMonitor.stop();
});
