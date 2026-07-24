import AsyncStorage from '@react-native-async-storage/async-storage';
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
  readRpm,
  readSpeed,
  readThrottle,
  readFuelLevel,
  readOilTemp,
  readAmbientAirTemp,
  readFuelRate,
  ObdSnapshot,
  DtcCode,
  FreezeFrameSnapshot,
} from './ObdReader';
import { evaluate, Finding } from './diagnosticEngine';
import { getActiveRules, refreshRulesFromServer } from './diagnosticRulesStore';
import { detectDrivingEvents, scoreFromCounts, SpeedSample } from '../drivingScore/drivingScoreEngine';
import { useObdSessionStore } from '../../store/obdSessionStore';
import { startObdKeepAlive, stopObdKeepAlive } from './obdKeepAliveService';
import { syncDtcNotifications } from './dtcNotificationStore';
import { ewmaStep } from '../../utils/ewma';
import { getSessionVin, VehicleCapability } from './capabilityService';
import { obdPollingScheduler } from './obdPollingScheduler';
import { obdSessionStateMachine } from './obdSessionStateMachine';
import { createLogger } from './obdLogger';

const dtcLog = createLogger('dtc');
const perfLog = createLogger('performance');

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

// Tầng medium (bản thân poll() giữ nguyên nhịp/logic cũ) chạy qua
// obdPollingScheduler thay vì setInterval thô (mục 3 yêu cầu cải tiến) - xem
// obdLiveMonitor.start()/.stop() bên dưới.
let running = false;
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

// Fuel rate (PID 5E, rà soát 23/7) - đã có decoder từ trước nhưng chỉ đọc ở màn
// kỹ thuật, chưa từng vào tổng hợp phiên. Đọc ở tầng slow (45s) chung với
// fuelLevel/oilTemp/ambientTemp - không đáng thêm round-trip riêng cho 1 số
// liệu đổi chậm. Lít tiêu thụ ước tính = tích phân rate(L/h) theo THỜI GIAN
// THỰC giữa 2 lần đọc (Date.now(), không phải nhịp cố định của tầng slow) -
// cùng nguyên tắc "gap nền" ở poll() medium: app có thể bị OS đóng băng giữa 2
// lần đọc slow tier, dùng nhịp danh nghĩa 45s sẽ tính sai lượng nhiên liệu.
let aggFuelRate = newAgg();
let fuelUsedLiters = 0;
let lastFuelRateAt: number | null = null;
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

// Giá trị MƯỢT (EWMA) cho gauge hiển thị (mục 12 kiểm toán 16/07) - TÁCH KHỎI
// snapshot RAW dùng cho rule engine/aggregator ở trên: làm mượt giảm giật do nhiễu
// lượng tử hoá BLE trên gauge, nhưng rule engine cần giá trị tức thời thật để không
// trễ pha/bỏ sót đỉnh ngắn (vd 1 lần quá nhiệt thoáng qua vẫn phải bắt được).
let smoothedRpm: number | null = null;
let smoothedSpeedKmh: number | null = null;
let smoothedEngineLoadPct: number | null = null;
let smoothedCoolantTempC: number | null = null;
let smoothedThrottlePct: number | null = null;
let smoothedControlModuleVoltage: number | null = null;

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
// Freeze Frame (mode 02): chụp cho MỖI mã DTC mới riêng biệt trong phiên (tối
// đa MAX_FREEZE_FRAMES mã để không tốn round-trip vô hạn trên phiên nhiều lỗi
// bất thường) - trước đây chỉ chụp cho mã đầu tiên, các mã mới xuất hiện sau
// cùng phiên không có freeze frame.
const MAX_FREEZE_FRAMES = 5;
let freezeFrames: Record<string, FreezeFrameSnapshot> = {};
let lastConfirmedDtc: DtcCode[] = [];
let lastPendingDtc: DtcCode[] = [];
let lastPermanentDtc: DtcCode[] = [];
let sessionCapability: VehicleCapability | null = null;
let sessionStartedAtMs: number | null = null;

function feed(agg: Agg, v: number | null): void {
  if (v === null) return;
  agg.sum += v; agg.n += 1;
  if (v < agg.min) agg.min = v;
  if (v > agg.max) agg.max = v;
}

function resetSessionStats(): void {
  aggCoolant = newAgg(); aggVoltage = newAgg(); aggLoad = newAgg(); aggIdleRpm = newAgg();
  aggRpmAll = newAgg(); aggIdleThrottle = newAgg();
  aggFuelRate = newAgg(); fuelUsedLiters = 0; lastFuelRateAt = null;
  maxSpeed = null; sessionDtcCount = 0; sessionFindingIds = new Set();
  lastSpeedSample = null; harshBrakeCount = 0; harshAccelCount = 0;
  smoothedRpm = null; smoothedSpeedKmh = null; smoothedEngineLoadPct = null;
  smoothedCoolantTempC = null; smoothedThrottlePct = null; smoothedControlModuleVoltage = null;
  engineRunSeconds = 0; drivingSeconds = 0; currentPhase = 'engine_off';
  sessionPendingDtcCount = 0; sessionPermanentDtcCount = 0; permanentDtcChecked = false;
  freezeFrames = {};
  lastConfirmedDtc = []; lastPendingDtc = []; lastPermanentDtc = [];
  sessionCapability = null;
  sessionStartedAtMs = Date.now();
  lastPollAt = null; backgroundGapCount = 0; backgroundGapSecondsTotal = 0;
  consecutiveAllNullPolls = 0; vehicleUnresponsiveNotified = false;
  obdSessionStateMachine.clearHistory();
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
    // PID 5E (rà soát 23/7) - trước chỉ đọc ở màn kỹ thuật. fuel_used_liters_est
    // là ước tính TÍCH PHÂN theo tầng slow (45s), không đo trực tiếp -
    // sai số cộng dồn nếu link rớt liên tục giữa các lần đọc slow tier.
    fuel_rate_avg: avg(aggFuelRate, 1),
    fuel_used_liters_est: aggFuelRate.n ? Number(fuelUsedLiters.toFixed(2)) : null,
    speed_max: maxSpeed,
    dtc_count: sessionDtcCount,
    findings: [...sessionFindingIds],
    engine_run_seconds: engineRunSeconds,
    driving_seconds: drivingSeconds,
    session_phase: currentPhase,
    pending_dtc_count: sessionPendingDtcCount,
    permanent_dtc_count: sessionPermanentDtcCount,
    // Giữ freeze_frame (số ít, mã ĐẦU tiên) cho phía tiêu thụ cũ không đổi -
    // freeze_frames (số nhiều, theo mã) là dữ liệu mới, đầy đủ hơn.
    freeze_frame: Object.values(freezeFrames)[0] ?? null,
    freeze_frames: freezeFrames,
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
    // Chuẩn hoá cho Vehicle Timeline (mục 8 yêu cầu cải tiến) - CHỈ chuẩn hoá dữ
    // liệu, chưa dựng UI/Timeline đầy đủ.
    start_time: sessionStartedAtMs ? new Date(sessionStartedAtMs).toISOString() : null,
    end_time: new Date().toISOString(),
    vin: getSessionVin(),
    capability: sessionCapability
      ? { supportedPids: sessionCapability.supportedPids, discoveredAt: sessionCapability.discoveredAt }
      : null,
    session_state: obdSessionStateMachine.getState(),
    // Cắt tail (rà soát pull mới nhất từ backend, ObdController::storeSession()):
    // toàn bộ `summary` bị GIỚI HẠN 8192 byte và bị XOÁ SẠCH (không phải cắt bớt)
    // nếu vượt - lịch sử đầy đủ (tối đa MAX_HISTORY=200 mục) một mình đã có thể
    // vượt ngưỡng này, kéo theo mất luôn coolant_max/driving_score/dtc_count...
    // Backend hiện chỉ cần biết CHUỖI trạng thái gần nhất (chuẩn hoá dữ liệu, chưa
    // dùng Timeline đầy đủ) - lịch sử ĐẦY ĐỦ vẫn có qua obdSessionStateMachine.getHistory()
    // cho tiêu thụ TẠI MÁY nếu cần sau này.
    session_state_history: obdSessionStateMachine.getHistory().slice(-20),
    dtc_snapshot: {
      confirmed: lastConfirmedDtc,
      pending: lastPendingDtc,
      permanent: lastPermanentDtc,
    },
  };
}

// Rà soát 24/7: buildSessionSummary() chỉ được ghi vào hàng đợi offline lúc
// NGẮT KẾT NỐI (bleService.addDisconnectListener bên dưới) - nếu app bị OS/
// user kill giữa lúc đang kết nối (không rút cáp đàng hoàng), listener đó
// không có cơ hội chạy -> mất trắng phiên, không dấu vết. Checkpoint định kỳ
// (persistCheckpoint, đăng ký làm 1 task riêng của scheduler) ghi tạm tóm tắt
// hiện tại xuống AsyncStorage; recoverOrphanedCheckpoint() ở đầu start() đọc
// lại checkpoint còn sót từ lần chạy app TRƯỚC (nếu có) và coi như 1 phiên đã
// hoàn tất, đẩy vào đúng hàng đợi offline hiện có - không cần API/schema mới.
const CHECKPOINT_KEY = 'obd_session_checkpoint';

type SessionCheckpoint = {
  vehicleId: number;
  deviceName: string | null;
  startedAt: number;
  summary: Record<string, unknown>;
};

// Chống race hiếm (cùng tinh thần clearEpoch ở syncQueue.ts): nếu ngắt kết nối
// rơi ĐÚNG lúc 1 lần ghi checkpoint đang bay (await AsyncStorage.setItem chưa
// xong) thì checkpoint có thể ghi lại SAU khi stop() đã xoá sạch - phiên đã
// lưu đúng cách qua đường bình thường sẽ bị recoverOrphanedCheckpoint() đọc
// lại và đẩy TRÙNG ở lần start() kế tiếp. Tăng epoch mỗi lần stop() để phát
// hiện và huỷ ghi.
let checkpointEpoch = 0;

async function persistCheckpoint(): Promise<void> {
  if (!activeVehicleId || !sessionStartedAtMs) return;
  const epochAtStart = checkpointEpoch;
  const summary = buildSessionSummary();
  if (!summary) return;
  const checkpoint: SessionCheckpoint = {
    vehicleId: activeVehicleId,
    deviceName: bleService.getDeviceName(),
    startedAt: sessionStartedAtMs,
    summary,
  };
  if (checkpointEpoch !== epochAtStart) return; // stop() đã chạy giữa chừng - đừng ghi đè checkpoint đã bị xoá
  await AsyncStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint)).catch(() => {});
}

async function recoverOrphanedCheckpoint(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return;
    const checkpoint = JSON.parse(raw) as SessionCheckpoint;
    const durationSeconds = Math.max(0, Math.round((Date.now() - checkpoint.startedAt) / 1000));
    await enqueueObdSession({
      vehicle_id: checkpoint.vehicleId,
      device_name: checkpoint.deviceName,
      connected_at: new Date(checkpoint.startedAt).toISOString(),
      duration_seconds: durationSeconds,
      summary: checkpoint.summary,
    });
  } catch {
    // Checkpoint hỏng/parse lỗi - bỏ qua, không được để crash luồng start() bình thường.
  } finally {
    await AsyncStorage.removeItem(CHECKPOINT_KEY).catch(() => {});
  }
}

const snapshotListeners = new Set<(s: ObdSnapshot) => void>();
const smoothedSnapshotListeners = new Set<(s: ObdSnapshot) => void>();
const dtcListeners = new Set<(codes: DtcCode[]) => void>();
const pendingDtcListeners = new Set<(codes: DtcCode[]) => void>();
const permanentDtcListeners = new Set<(codes: DtcCode[]) => void>();
const findingListeners = new Set<(findings: Finding[]) => void>();
const vehicleUnresponsiveListeners = new Set<() => void>();

// Fast/Slow tier (mục 3 yêu cầu cải tiến) - độc lập với poll() (tầng medium,
// giữ nguyên như cũ). Không đụng tới pollCount/aggregate/DTC/rule - chỉ phát
// thêm dữ liệu tần suất khác cho UI cần đọc nhanh hơn (kim đồng hồ RPM/tốc độ)
// hoặc chậm hơn (nhiên liệu/nhiệt độ dầu/nhiệt độ môi trường).
export type FastSnapshot = { rpm: number | null; speedKmh: number | null; throttlePct: number | null; timestamp: number };
export type SlowSnapshot = {
  fuelLevelPct: number | null;
  oilTempC: number | null;
  ambientAirTempC: number | null;
  fuelRateLPerHour: number | null;
  timestamp: number;
};
const fastSnapshotListeners = new Set<(s: FastSnapshot) => void>();
const slowSnapshotListeners = new Set<(s: SlowSnapshot) => void>();

async function pollFastTier(): Promise<void> {
  if (!bleService.isConnected()) return;
  const [rpm, speedKmh, throttlePct] = await Promise.all([readRpm(), readSpeed(), readThrottle()]);
  fastSnapshotListeners.forEach((fn) => fn({ rpm, speedKmh, throttlePct, timestamp: Date.now() }));
}

async function pollSlowTier(): Promise<void> {
  if (!bleService.isConnected()) return;
  const [fuelLevelPct, oilTempC, ambientAirTempC, fuelRateLPerHour] = await Promise.all([
    readFuelLevel(), readOilTemp(), readAmbientAirTemp(), readFuelRate(),
  ]);
  const now = Date.now();
  slowSnapshotListeners.forEach((fn) => fn({ fuelLevelPct, oilTempC, ambientAirTempC, fuelRateLPerHour, timestamp: now }));

  feed(aggFuelRate, fuelRateLPerHour);
  // Chỉ tích luỹ lít khi có 2 mốc LIÊN TIẾP đều đọc được rate - 1 lần null xen
  // giữa (mất sóng thoáng qua) bỏ qua đúng khoảng đó thay vì đoán mò giá trị.
  if (fuelRateLPerHour !== null && lastFuelRateAt !== null) {
    const elapsedHours = (now - lastFuelRateAt) / 3_600_000;
    fuelUsedLiters += fuelRateLPerHour * elapsedHours;
  }
  lastFuelRateAt = fuelRateLPerHour !== null ? now : null;
}

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

    // Gauge hiển thị: bản MƯỢT (EWMA) của snapshot, phát riêng cho màn hình nào
    // muốn đỡ giật hình - rule engine bên dưới vẫn dùng `snapshot` RAW, không đổi.
    smoothedRpm = ewmaStep(smoothedRpm, snapshot.rpm);
    // Rà soát (góp ý user: tốc độ hiện số lẻ vd "9,5km/h" và bị trễ - xe dừng
    // hẳn rồi số vẫn giảm dần thêm chục giây) - EWMA alpha=0.3 trên nhịp 3s
    // khiến giá trị giảm dần 0.7^n thay vì rớt về 0 ngay khi xe dừng thật. Tốc
    // độ (PID 0D) vốn là số nguyên từ ECU, không nhiễu lượng tử hoá như RPM/
    // nhiệt độ đọc analog nên không cần làm mượt - dùng thẳng giá trị RAW.
    smoothedSpeedKmh = snapshot.speedKmh;
    smoothedEngineLoadPct = ewmaStep(smoothedEngineLoadPct, snapshot.engineLoadPct);
    smoothedCoolantTempC = ewmaStep(smoothedCoolantTempC, snapshot.coolantTempC);
    smoothedThrottlePct = ewmaStep(smoothedThrottlePct, snapshot.throttlePct);
    smoothedControlModuleVoltage = ewmaStep(smoothedControlModuleVoltage, snapshot.controlModuleVoltage);
    if (smoothedSnapshotListeners.size > 0) {
      smoothedSnapshotListeners.forEach((fn) => fn({
        ...snapshot,
        rpm: smoothedRpm,
        speedKmh: smoothedSpeedKmh,
        engineLoadPct: smoothedEngineLoadPct,
        coolantTempC: smoothedCoolantTempC,
        throttlePct: smoothedThrottlePct,
        controlModuleVoltage: smoothedControlModuleVoltage,
      }));
    }

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
    // Vehicle Session State Machine (mục 4 yêu cầu cải tiến): tái dùng đúng
    // currentPhase vừa suy ra ở trên, không tính lại logic rpm/speed lần 2.
    if (currentPhase === 'driving') obdSessionStateMachine.setDriving();
    else if (currentPhase === 'idle') obdSessionStateMachine.setEngineIdle();
    else obdSessionStateMachine.setEngineOff();
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
      lastConfirmedDtc = codes;
      if (codes.length > 0) {
        sessionDtcCount = codes.length;
        dtcListeners.forEach((fn) => fn(codes));
        dtcLog.info('mode 03 confirmed DTC', codes.map((c) => c.code));
        // Báo server các mã CHƯA báo trong phiên này (fire-and-forget)
        const fresh = codes.filter((c) => !reportedCodes.has(c.code));
        // Freeze Frame (mode 02): chụp thông số ECU cho MỖI mã MỚI riêng biệt
        // (tối đa MAX_FREEZE_FRAMES/phiên) - trước đây chỉ chụp mã đầu tiên.
        for (const c of fresh) {
          if (Object.keys(freezeFrames).length >= MAX_FREEZE_FRAMES) break;
          if (freezeFrames[c.code]) continue;
          freezeFrames[c.code] = await readFreezeFrame();
          dtcLog.info('freeze frame captured', c.code);
        }
        if (fresh.length > 0 && activeVehicleId) {
          fresh.forEach((c) => reportedCodes.add(c.code));
          obdApi.reportDtc(activeVehicleId, fresh).catch(() => {});
        }
      }
      // Thông báo đẩy mã lỗi mới - dùng bộ nhớ BỀN VỮNG riêng (không phải
      // reportedCodes ở trên, chỉ sống trong phiên) nên không báo lại spam mỗi lần
      // kết nối lại dongle cho 1 lỗi user chưa/không sửa; và tự "quên" mã đã biến
      // mất (xe đã sửa) để nếu tái xuất hiện sau này vẫn coi là mới (rà soát 17/7).
      if (activeVehicleId) {
        syncDtcNotifications(activeVehicleId, codes).catch(() => {});
      }

      // Mode 07 - Pending DTC: cùng nhịp mode 03 (đang hình thành, đổi liên
      // tục) nhưng KHÔNG báo server/không gộp dtc_count chính thức - ý nghĩa
      // khác DTC đã xác nhận, tránh báo động giả ("Phát hiện lỗi đang hình thành").
      const pending = await readPendingDtcCodes();
      lastPendingDtc = pending;
      // Rà soát 16/7: gán lại toàn bộ (không chỉ khi length>0) - mã đang hình
      // thành có thể tự hết giữa phiên; trước đây chỉ set khi >0 nên count kẹt
      // ở đỉnh cũ, không bao giờ về 0 dù xe đã sạch mã pending.
      sessionPendingDtcCount = pending.length;
      if (pending.length > 0) {
        pendingDtcListeners.forEach((fn) => fn(pending));
        dtcLog.info('mode 07 pending DTC (đang hình thành)', pending.map((c) => c.code));
      }

      // Mode 0A - Permanent DTC: gần như tĩnh trong 1 phiên (chỉ tự xoá sau
      // nhiều chu kỳ lái đạt chuẩn) - chỉ cần đọc 1 LẦN, không lặp mỗi 5 phút
      // như mode 03/07 (đỡ round-trip BLE vô ích cho dữ liệu hiếm khi đổi).
      if (!permanentDtcChecked) {
        permanentDtcChecked = true;
        const permanent = await readPermanentDtcCodes();
        lastPermanentDtc = permanent;
        if (permanent.length > 0) {
          sessionPermanentDtcCount = permanent.length;
          permanentDtcListeners.forEach((fn) => fn(permanent));
          dtcLog.info('mode 0A permanent DTC', permanent.map((c) => c.code));
        }
      }
    }
  } catch {
    // Poll lỗi thoáng qua - bỏ qua, vòng sau thử lại
  } finally {
    inFlight = false;
    perfLog.debug(`medium poll #${pollCount} done`);
  }
}

export const obdLiveMonitor = {
  isRunning(): boolean {
    return running;
  },

  getVehicleId(): number | null {
    return activeVehicleId;
  },

  /** Capability đã dò/cache của phiên hiện tại - chỉ để CHUẨN HOÁ session
   * summary (mục 8 yêu cầu cải tiến), không dùng để gate PID (đã có
   * setActivePidWhitelist bên ObdReader.ts từ trước). */
  setSessionCapability(capability: VehicleCapability | null): void {
    sessionCapability = capability;
  },

  getSessionState() {
    return obdSessionStateMachine.getState();
  },

  /** Rà soát 24/7 (user báo cáo "Phân tích dữ liệu OBD2" hiện phiên cũ/ngắn
   * hơn phiên lái thật vừa xong): checkpoint mồ côi (app bị kill giữa phiên,
   * rút cáp/tắt Bluetooth đột ngột không qua disconnect listener bình thường)
   * trước đây CHỈ được đẩy lên server ở lần connect() KẾ TIẾP
   * (recoverOrphanedCheckpoint() trong start()) - nếu user mở màn Báo cáo mà
   * chưa cắm lại OBD, dữ liệu phiên lái nhanh vừa rồi vẫn kẹt trong
   * AsyncStorage cục bộ, màn Báo cáo chỉ thấy được phiên cũ hơn đã đồng bộ
   * trước đó. Gọi được sớm hơn từ màn Báo cáo qua hàm này. Chỉ an toàn khi
   * KHÔNG có phiên nào đang chạy - nếu đang chạy, checkpoint hiện tại là của
   * chính phiên sống (ghi mỗi 60s), CHƯA mồ côi, đừng đẩy nó lên như 1 phiên
   * đã kết thúc (sẽ tách 1 chuyến lái thành 2 bản ghi sai). */
  async recoverPendingCheckpoint(): Promise<void> {
    if (running) return;
    await recoverOrphanedCheckpoint();
  },

  /** Bắt đầu theo phiên kết nối - gọi sau khi connect thành công. */
  start(vehicleId: number): void {
    if (running) {
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
    // Rà soát 24/7: đẩy nốt checkpoint còn sót từ lần chạy app TRƯỚC (app bị
    // kill giữa phiên, không rút cáp đàng hoàng) TRƯỚC KHI bắt đầu phiên mới -
    // xem persistCheckpoint()/recoverOrphanedCheckpoint() ở trên.
    recoverOrphanedCheckpoint().catch(() => {});
    // Tải rule mới nhất đúng lúc sắp dùng - không chặn vòng poll đầu tiên
    refreshRulesFromServer().catch(() => {});

    // Polling Scheduler (mục 3 yêu cầu cải tiến): tầng medium = đúng poll() cũ,
    // không đổi hành vi/test hiện có. Tầng fast/slow là bổ sung mới, độc lập.
    obdPollingScheduler.register({ id: 'core-medium', tier: 'medium', intervalMs: POLL_INTERVAL_MS, run: poll });
    obdPollingScheduler.register({ id: 'core-fast', tier: 'fast', run: pollFastTier });
    obdPollingScheduler.register({ id: 'core-slow', tier: 'slow', run: pollSlowTier });
    // Checkpoint mỗi 60s (không cần nhanh như slow tier fuel/oil-temp) - xem
    // persistCheckpoint() ở trên.
    obdPollingScheduler.register({ id: 'core-checkpoint', tier: 'slow', intervalMs: 60000, run: persistCheckpoint });
    obdPollingScheduler.start();
    running = true;

    // Gap nền thật (fixture #5, 16/7): giữ tiến trình JS sống khi khoá màn hình
    // lúc đang lái - xem obdKeepAliveService.ts. Ghi lại kết quả (chạy được hay
    // bị bỏ qua vì lý do gì) vào chính session log xuất ra - rà soát 20/7: khoảng
    // lặng dài bất thường vẫn thấy trong fixture nhưng không cách nào xác nhận
    // được lúc đó keep-alive có chạy hay đã âm thầm bỏ qua.
    startObdKeepAlive()
      .then((status) => bleService.logDiagnostic('#keepalive', status))
      .catch(() => bleService.logDiagnostic('#keepalive', 'error'));
  },

  stop(): void {
    obdPollingScheduler.stop();
    obdPollingScheduler.unregister('core-medium');
    obdPollingScheduler.unregister('core-fast');
    obdPollingScheduler.unregister('core-slow');
    obdPollingScheduler.unregister('core-checkpoint');
    running = false;
    activeVehicleId = null;
    stopObdKeepAlive().catch(() => {});
    // Phiên vừa kết thúc qua đường bình thường (disconnect listener đã enqueue
    // summary thật) - checkpoint tạm không còn cần nữa, tránh recoverOrphanedCheckpoint()
    // đọc lại và đẩy trùng phiên này lần start() kế tiếp. Tăng epoch TRƯỚC khi
    // xoá - persistCheckpoint() đang bay giữa chừng sẽ tự huỷ ghi thay vì ghi
    // đè lại sau khi đã xoá (xem checkpointEpoch ở trên).
    checkpointEpoch++;
    AsyncStorage.removeItem(CHECKPOINT_KEY).catch(() => {});
  },

  onSnapshot(fn: (s: ObdSnapshot) => void): () => void {
    snapshotListeners.add(fn);
    return () => snapshotListeners.delete(fn);
  },

  /**
   * Bản MƯỢT (EWMA) của snapshot - dùng cho gauge hiển thị (giảm giật do nhiễu BLE).
   * KHÔNG dùng cho chẩn đoán/rule engine - dùng onSnapshot() (RAW) cho việc đó.
   */
  onSmoothedSnapshot(fn: (s: ObdSnapshot) => void): () => void {
    smoothedSnapshotListeners.add(fn);
    return () => smoothedSnapshotListeners.delete(fn);
  },

  /** Tầng fast (250-500ms): rpm/speed/throttle - dữ liệu "tức thời" cho kim
   * đồng hồ, KHÔNG dùng cho thống kê phiên/rule engine (vẫn ở tầng medium). */
  onFastSnapshot(fn: (s: FastSnapshot) => void): () => void {
    fastSnapshotListeners.add(fn);
    return () => fastSnapshotListeners.delete(fn);
  },

  /** Tầng slow (30-60s): nhiên liệu/nhiệt độ dầu/nhiệt độ môi trường. */
  onSlowSnapshot(fn: (s: SlowSnapshot) => void): () => void {
    slowSnapshotListeners.add(fn);
    return () => slowSnapshotListeners.delete(fn);
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
  // Reset RIÊNG trạng thái EWMA gauge (không đụng aggregate phiên - maxSpeed/DTC/...
  // vẫn phải sống qua reconnect): giá trị thật có thể đã nhảy trong lúc mất kết nối
  // (vd tắt-nổ lại máy), giữ EWMA cũ sẽ khiến gauge "trườn" từ giá trị lỗi thời thay
  // vì phản ánh cú nhảy thật.
  smoothedRpm = null; smoothedSpeedKmh = null; smoothedEngineLoadPct = null;
  smoothedCoolantTempC = null; smoothedThrottlePct = null; smoothedControlModuleVoltage = null;
});

bleService.addDisconnectListener(() => {
  // Vehicle Session State Machine (mục 4): STOPPED trước khi tổng hợp summary
  // (session_state_history phản ánh đúng đuôi phiên), DISCONNECTED sau khi
  // obdLiveMonitor.stop() chạy xong ở cuối handler này.
  obdSessionStateMachine.setStopped();

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
  obdSessionStateMachine.setDisconnected();
});
