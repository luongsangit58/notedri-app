import { obdApi } from '../../api/obd';
import { bleService } from './BleService';
import { enqueueObdSession, flushPendingObdSessions } from './ObdSessionSyncQueue';
import {
  readSnapshot,
  readDtcCodes,
  readPendingDtcCodes,
  readPermanentDtcCodes,
  readFreezeFrame,
  reinitElm327AfterReconnect,
  ObdSnapshot,
  DtcCode,
  FreezeFrameSnapshot,
} from './ObdReader';
import { evaluate, Finding } from './diagnosticEngine';
import { getActiveRules, refreshRulesFromServer } from './diagnosticRulesStore';
import { detectDrivingEvents, scoreFromCounts, SpeedSample } from '../drivingScore/drivingScoreEngine';
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

// Trạng thái phiên (đề xuất 15/7, bản RÚT GỌN - không dựng state machine đầy đủ
// như GPS đã có riêng cho "đang lái", chỉ suy trực tiếp từ rpm/speed mỗi vòng
// poll để Knowledge Engine dùng sau này qua buildSessionSummary()).
export type SessionPhase = 'engine_off' | 'idle' | 'driving';

// Khoảng cách giữa 2 lần poll vượt xa nhịp 3s bình thường = JS timer bị OS đóng
// băng khi app vào nền (bài học fixture #5: gap 144s/1700s/980s không hề bị BLE
// coi là mất kết nối - sessionLog vẫn liền mạch). Không tự suy ra ngưỡng từ
// POLL_INTERVAL_MS vì link kém (skipBeat) đã khiến nhịp thưa gấp đôi bình
// thường; 15s bao dung cả trường hợp đó mà vẫn bắt được các gap phút/chục-phút.
const BACKGROUND_GAP_THRESHOLD_MS = 15000;

// Toàn bộ PID hiển thị null liên tiếp N lần (~ N*3s) = xe đã tắt máy/ECU ngủ
// trong khi adapter vẫn giữ BLE (đúng đuôi fixture #5: 9s NO DATA rồi phiên
// dừng) - KHÔNG phải app/adapter lỗi. 3 lần vừa đủ để loại nhiễu 1 lần đọc lẻ.
const VEHICLE_UNRESPONSIVE_THRESHOLD = 3;

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let skipBeat = false;
let pollCount = 0;
let activeVehicleId: number | null = null;
let reportedCodes = new Set<string>();
let lastPollAt: number | null = null;
let backgroundGapCount = 0;
let backgroundGapSecondsTotal = 0;
let consecutiveAllNullPolls = 0;
let vehicleUnresponsiveNotified = false;

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

// Chấm điểm lái xe (Giai đoạn G, _bmad-output/driving-score-design-proposal-
// 2026-07-14.md): tốc độ ECU (PID 0D) đã đọc mỗi 3s cho live-monitor sẵn có -
// tái dùng làm nguồn phát hiện phanh gấp/tăng tốc đột ngột, KHÔNG tốn thêm pin.
// Chỉ giữ MẪU LIỀN TRƯỚC (không giữ cả mảng) để không phình bộ nhớ theo phiên
// dài - detectDrivingEvents chạy trên đúng 1 cặp mẫu mỗi lần, giống cách các
// Agg khác trong file này tích luỹ dần chứ không giữ lịch sử thô.
let lastSpeedSample: SpeedSample | null = null;
let harshBrakeCount = 0;
let harshAccelCount = 0;

// Giây MÁY ĐÃ CHẠY (rpm>0) trong phiên (E5 core + sửa bug rule van hằng nhiệt
// 14/7): cộng dồn POLL_INTERVAL mỗi vòng poll có rpm>0. Dùng làm ngưỡng cho rule
// engine thay vì thời gian BLE (adapter cắm cổng luôn có điện, connect trước khi
// nổ máy - thời gian BLE khiến rule báo nhầm ngay sau đề máy nguội).
let engineRunSeconds = 0;

// Giây "đang lái" (rpm>0 VÀ speed>0) - phần con của engineRunSeconds; idle suy
// ra được ở tầng đọc (engineRunSeconds - drivingSeconds), không cần đếm riêng.
let drivingSeconds = 0;
let currentPhase: SessionPhase = 'engine_off';

// Pending DTC (mode 07): đếm mã đang hình thành trong phiên, KHÔNG cộng vào
// sessionDtcCount/reportDtc - ý nghĩa khác DTC đã xác nhận, tránh báo nhầm.
let sessionPendingDtcCount = 0;
// Permanent DTC (mode 0A): gần như tĩnh trong 1 phiên, chỉ đọc 1 lần.
let sessionPermanentDtcCount = 0;
let permanentDtcChecked = false;
// Freeze Frame (mode 02): chụp 1 lần cho mã DTC MỚI đầu tiên trong phiên.
let freezeFrame: FreezeFrameSnapshot | null = null;

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
  lastSpeedSample = null; harshBrakeCount = 0; harshAccelCount = 0;
  engineRunSeconds = 0; drivingSeconds = 0; currentPhase = 'engine_off';
  sessionPendingDtcCount = 0; sessionPermanentDtcCount = 0; permanentDtcChecked = false;
  freezeFrame = null;
  lastPollAt = null; backgroundGapCount = 0; backgroundGapSecondsTotal = 0;
  consecutiveAllNullPolls = 0; vehicleUnresponsiveNotified = false;
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
    engine_run_seconds: engineRunSeconds,
    driving_seconds: drivingSeconds,
    session_phase: currentPhase,
    pending_dtc_count: sessionPendingDtcCount,
    permanent_dtc_count: sessionPermanentDtcCount,
    freeze_frame: freezeFrame,
    harsh_brake_count: harshBrakeCount,
    harsh_accel_count: harshAccelCount,
    // Số lần / tổng giây "khoảng trống nền" (fixture #5) trong phiên - phân biệt
    // phiên liền mạch với phiên bị JS timer đóng băng nhiều lần, để trend
    // analysis/QA không hiểu lầm rpm_avg v.v. là tính trên dữ liệu liên tục.
    background_gap_count: backgroundGapCount,
    background_gap_seconds_total: backgroundGapSecondsTotal,
    // Thời lượng phiên (không phải quãng đường - OBD live-monitor không theo dõi
    // quãng đường, GPS là nguồn chuyến duy nhất) làm đơn vị chuẩn hoá mật độ.
    driving_score: scoreFromCounts(harshBrakeCount, harshAccelCount, bleService.getSessionAgeSeconds() / 60),
  };
}

const snapshotListeners = new Set<(s: ObdSnapshot) => void>();
const dtcListeners = new Set<(codes: DtcCode[]) => void>();
const pendingDtcListeners = new Set<(codes: DtcCode[]) => void>();
const permanentDtcListeners = new Set<(codes: DtcCode[]) => void>();
const findingListeners = new Set<(findings: Finding[]) => void>();
const vehicleUnresponsiveListeners = new Set<() => void>();

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

    // Gap nền (fixture #5): so mốc THỰC (Date.now()) với lần poll trước, KHÔNG
    // dựa vào setInterval - chính setInterval là thứ bị OS đóng băng nên không
    // tự báo được độ trễ của chính nó.
    const now = Date.now();
    if (lastPollAt !== null) {
      const gapMs = now - lastPollAt;
      if (gapMs > BACKGROUND_GAP_THRESHOLD_MS) {
        backgroundGapCount += 1;
        backgroundGapSecondsTotal += Math.round(gapMs / 1000);
      }
    }
    lastPollAt = now;

    const snapshot = await readSnapshot();
    snapshotListeners.forEach((fn) => fn(snapshot));

    // Toàn bộ PID null liên tiếp = xe đã tắt máy/ECU ngủ trong khi BLE vẫn sống
    // (đuôi fixture #5) - báo tầng trên để hiển thị thông báo phù hợp thay vì
    // loading vô thời hạn. KHÔNG tự ngắt BLE: máy có thể sắp nổ lại.
    // CHỈ xét 6 PID lõi (rpm/speed/load/coolant/throttle/voltage) - CỐ Ý bỏ
    // fuelLevelPct/oilTempC: fixture #2 xác nhận nhiều xe (Honda City) không hỗ
    // trợ 2 PID này nên chúng null VĨNH VIỄN dù xe hoàn toàn bình thường; null
    // của chúng không nói lên gì về việc ECU còn phản hồi hay không, đưa vào
    // "allNull" sẽ là nhiễu chứ không phải tín hiệu.
    const allNull =
      snapshot.rpm === null && snapshot.speedKmh === null && snapshot.engineLoadPct === null &&
      snapshot.coolantTempC === null && snapshot.throttlePct === null && snapshot.controlModuleVoltage === null;
    if (allNull) {
      consecutiveAllNullPolls += 1;
      if (consecutiveAllNullPolls >= VEHICLE_UNRESPONSIVE_THRESHOLD && !vehicleUnresponsiveNotified) {
        vehicleUnresponsiveNotified = true;
        vehicleUnresponsiveListeners.forEach((fn) => fn());
      }
    } else {
      consecutiveAllNullPolls = 0;
      vehicleUnresponsiveNotified = false;
    }

    // E1: tích luỹ thống kê phiên
    feed(aggCoolant, snapshot.coolantTempC);
    feed(aggVoltage, snapshot.controlModuleVoltage);
    feed(aggLoad, snapshot.engineLoadPct);
    feed(aggRpmAll, snapshot.rpm);
    // Máy đang chạy (rpm>0) -> cộng dồn thời gian máy chạy cho ngưỡng rule.
    // Trạng thái phiên: suy trực tiếp từ rpm/speed mỗi vòng poll (xem SessionPhase).
    if (snapshot.rpm !== null && snapshot.rpm > 0) {
      engineRunSeconds += POLL_INTERVAL_MS / 1000;
      if (snapshot.speedKmh !== null && snapshot.speedKmh > 0) {
        drivingSeconds += POLL_INTERVAL_MS / 1000;
        currentPhase = 'driving';
      } else {
        currentPhase = 'idle';
      }
    } else {
      currentPhase = 'engine_off';
    }
    if (snapshot.speedKmh !== null) {
      if (maxSpeed === null || snapshot.speedKmh > maxSpeed) maxSpeed = snapshot.speedKmh;
      if (snapshot.speedKmh === 0) {
        feed(aggIdleRpm, snapshot.rpm);
        feed(aggIdleThrottle, snapshot.throttlePct);
      }

      const curSpeedSample: SpeedSample = { ts: Date.now(), speedKmh: snapshot.speedKmh };
      if (lastSpeedSample) {
        for (const ev of detectDrivingEvents([lastSpeedSample, curSpeedSample])) {
          if (ev.type === 'harsh_brake') harshBrakeCount += 1;
          else harshAccelCount += 1;
        }
      }
      lastSpeedSample = curSpeedSample;
    }

    // Rule engine trên từng snapshot (hàm thuần, rẻ)
    const findings = evaluate(getActiveRules(), {
      rpm: snapshot.rpm,
      speedKmh: snapshot.speedKmh,
      engineLoadPct: snapshot.engineLoadPct,
      coolantTempC: snapshot.coolantTempC,
      throttlePct: snapshot.throttlePct,
      controlModuleVoltage: snapshot.controlModuleVoltage,
      engineRunSeconds,
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
        // Freeze Frame (mode 02): chụp NGAY thông số ECU tại thời điểm phát hiện
        // mã MỚI - chỉ 1 lần/phiên (mã đầu tiên đáng giá nhất, không đọc lại
        // cho mã mới phát hiện sau đó cùng phiên).
        if (fresh.length > 0 && !freezeFrame) {
          freezeFrame = await readFreezeFrame();
        }
        if (fresh.length > 0 && activeVehicleId) {
          fresh.forEach((c) => reportedCodes.add(c.code));
          obdApi.reportDtc(activeVehicleId, fresh).catch(() => {});
        }
      }

      // Mode 07 - Pending DTC: cùng nhịp mode 03 (đang hình thành, đổi liên
      // tục) nhưng KHÔNG báo server/không gộp dtc_count chính thức - ý nghĩa
      // khác DTC đã xác nhận, tránh báo động giả ("Phát hiện lỗi đang hình thành").
      const pending = await readPendingDtcCodes();
      // Rà soát 16/7: gán lại toàn bộ (không chỉ khi length>0) - mã đang hình
      // thành có thể tự hết giữa phiên; trước đây chỉ set khi >0 nên count kẹt
      // ở đỉnh cũ, không bao giờ về 0 dù xe đã sạch mã pending.
      sessionPendingDtcCount = pending.length;
      if (pending.length > 0) pendingDtcListeners.forEach((fn) => fn(pending));

      // Mode 0A - Permanent DTC: gần như tĩnh trong 1 phiên (chỉ tự xoá sau
      // nhiều chu kỳ lái đạt chuẩn) - chỉ cần đọc 1 LẦN, không lặp mỗi 5 phút
      // như mode 03/07 (đỡ round-trip BLE vô ích cho dữ liệu hiếm khi đổi).
      if (!permanentDtcChecked) {
        permanentDtcChecked = true;
        const permanent = await readPermanentDtcCodes();
        if (permanent.length > 0) {
          sessionPermanentDtcCount = permanent.length;
          permanentDtcListeners.forEach((fn) => fn(permanent));
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

  /** Mode 07 - lỗi đang hình thành, CHƯA phải DTC chính thức - hiển thị tách biệt. */
  onPendingDtcFound(fn: (codes: DtcCode[]) => void): () => void {
    pendingDtcListeners.add(fn);
    return () => pendingDtcListeners.delete(fn);
  },

  /** Mode 0A - DTC không xoá được bằng ngắt ắc-quy/xoá tay thông thường. */
  onPermanentDtcFound(fn: (codes: DtcCode[]) => void): () => void {
    permanentDtcListeners.add(fn);
    return () => permanentDtcListeners.delete(fn);
  },

  getSessionPhase(): SessionPhase {
    return currentPhase;
  },

  onFindings(fn: (findings: Finding[]) => void): () => void {
    findingListeners.add(fn);
    return () => findingListeners.delete(fn);
  },

  /** Xe có vẻ đã tắt máy/ECU không phản hồi (toàn bộ PID null liên tiếp) - không phải mất BLE. */
  onVehicleUnresponsive(fn: () => void): () => void {
    vehicleUnresponsiveListeners.add(fn);
    return () => vehicleUnresponsiveListeners.delete(fn);
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
    const summary = buildSessionSummary();
    const durationSeconds = Math.max(0, Math.round((Date.now() - info.startedAt) / 1000));

    // Rà soát 16/7: user tắt kết nối xong không biết dữ liệu đã "tổng hợp/lưu"
    // hay chưa (không có phản hồi nào). Patch NGAY (đồng bộ, cùng tick BleService
    // fire listener TRƯỚC clear()) để ObdSessionBanner đọc được lastSessionSaved
    // đúng lúc connected chuyển false, không cần chờ enqueue/flush async xong -
    // "đã lưu" ở đây nghĩa là đã tổng hợp xong tại máy, không phải đã lên server.
    if (summary) {
      useObdSessionStore.getState().patch({
        lastSessionSaved: {
          samples: (summary.samples as number) ?? 0,
          durationSeconds,
          drivingScore: (summary.driving_score as number | undefined) ?? null,
          ts: Date.now(),
        },
      });
    }

    // E2: enqueue local TRƯỚC rồi mới thử gửi - rút cáp lúc mất mạng không còn mất
    // phiên (trước đây fire-and-forget thẳng). Flush lần sau: connect() trong useObd.
    enqueueObdSession({
      vehicle_id: vehicleId,
      device_name: info.deviceName,
      connected_at: new Date(info.startedAt).toISOString(),
      duration_seconds: durationSeconds,
      summary,
    })
      .then(() => flushPendingObdSessions())
      .catch(() => {});
  }

  obdLiveMonitor.stop();
});
