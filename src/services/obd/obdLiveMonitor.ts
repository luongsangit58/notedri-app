import { obdApi } from '../../api/obd';
import { bleService } from './BleService';
import {
  readSnapshot,
  readDtcCodes,
  reinitElm327AfterReconnect,
  ObdSnapshot,
  DtcCode,
} from './ObdReader';
import { evaluate, DiagnosticRule, Finding } from './diagnosticEngine';
import { useObdSessionStore } from '../../store/obdSessionStore';
import rulesFile from '../../data/diagnosticRules.json';

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
const RULES = (rulesFile as { rules: DiagnosticRule[] }).rules;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let skipBeat = false;
let pollCount = 0;
let activeVehicleId: number | null = null;
let reportedCodes = new Set<string>();

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

    // Rule engine trên từng snapshot (hàm thuần, rẻ)
    const findings = evaluate(RULES, {
      rpm: snapshot.rpm,
      speedKmh: snapshot.speedKmh,
      engineLoadPct: snapshot.engineLoadPct,
      coolantTempC: snapshot.coolantTempC,
      throttlePct: snapshot.throttlePct,
      controlModuleVoltage: snapshot.controlModuleVoltage,
      sessionAgeSeconds: bleService.getSessionAgeSeconds(),
    });
    findingListeners.forEach((fn) => fn(findings));

    // DTC: sớm ở vòng 2 rồi mỗi ~5 phút
    if (pollCount === 2 || pollCount % DTC_EVERY_N_POLLS === 0) {
      const codes = await readDtcCodes();
      if (codes.length > 0) {
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
      // Đổi xe giữa chừng (hiếm): reset bộ nhớ mã đã báo
      if (activeVehicleId !== vehicleId) reportedCodes = new Set();
      activeVehicleId = vehicleId;
      return;
    }
    activeVehicleId = vehicleId;
    pollCount = 0;
    reportedCodes = new Set();
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
    }).catch(() => {});
  }

  obdLiveMonitor.stop();
});
