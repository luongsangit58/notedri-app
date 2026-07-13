import { AppState, AppStateStatus } from 'react-native';
import { bleService } from './BleService';
import { readSnapshot, readDtcCodes, ObdSnapshot, DtcCode } from './ObdReader';

const POLL_INTERVAL_MS = 3000;
const IDLE_RPM_THRESHOLD = 200;
const IDLE_STOP_DELAY_MS = 30000;

export type TripSummary = {
  vehicleId: number;
  startedAt: string;
  endedAt: string;
  distanceKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  avgEngineLoad: number | null;
  avgCoolantTemp: number | null;
  fuelLevelStart: number | null;
  fuelLevelEnd: number | null;
  idleTimeSeconds: number;
  drivingTimeSeconds: number;
  snapshots: ObdSnapshot[];
  dtcCodes: DtcCode[];
};

type SessionState = 'idle' | 'running' | 'stopping' | 'stopped';

export class TripSession {
  private vehicleId: number;
  private state: SessionState = 'idle';
  private startedAt: Date | null = null;
  private snapshots: ObdSnapshot[] = [];
  private idleStartTime: number | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastSpeedReading: number | null = null;
  private distanceKm: number = 0;
  private lastTimestamp: number | null = null;
  private fuelLevelStart: number | null = null;
  private idleMs: number = 0;
  private dtcCodes: DtcCode[] = [];

  // iOS background handling: when app is suspended, setInterval pauses.
  // On foreground return we reset lastTimestamp so the next poll calculates
  // elapsedMs correctly (~POLL_INTERVAL_MS) instead of the entire background gap.
  // Distance for the suspended period is lost (conservative — can't read OBD in bg).
  private suspendedAt: number | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

  onTripEnd: ((summary: TripSummary) => void) | null = null;
  onSnapshot: ((snapshot: ObdSnapshot) => void) | null = null;
  onDtcFound: ((codes: DtcCode[]) => void) | null = null;

  constructor(vehicleId: number) {
    this.vehicleId = vehicleId;
  }

  start() {
    if (this.state !== 'idle') return;
    this.state = 'running';
    this.startedAt = new Date();
    this.snapshots = [];
    this.distanceKm = 0;
    this.idleMs = 0;
    this.dtcCodes = [];
    this.lastTimestamp = Date.now();

    this.appStateSubscription = AppState.addEventListener('change', this.handleAppState);
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop() {
    this.state = 'stopping';
    this.finalize();
  }

  private handleAppState = (next: AppStateStatus) => {
    if (next === 'background' || next === 'inactive') {
      this.suspendedAt = Date.now();
    } else if (next === 'active' && this.suspendedAt !== null) {
      // App returned from background. Reset lastTimestamp so the next poll
      // treats elapsed time as if we just polled (avoids distance spike).
      this.lastTimestamp = Date.now() - POLL_INTERVAL_MS;
      this.suspendedAt = null;
      // Also reset idle start time so the 30s auto-stop doesn't trigger
      // immediately after a long background period.
      this.idleStartTime = null;
    }
  };

  // Đường truyền kém → poll thưa đi một nửa (ý #16): BLE chập chờn thường tự hồi
  // khi bớt tải; dồn lệnh lúc yếu sóng chỉ làm chuỗi timeout dài thêm.
  private skipBeat = false;

  // Khoá chống chồng lấn: một vòng đọc chậm hơn 3s (BLE trễ) mà setInterval vẫn
  // bắn tiếp → 2 luồng readSnapshot chạy song song, lệnh gửi ĐÔI (bằng chứng
  // fixture #4: 010C,010C,010D,010D...). Vòng trước chưa xong thì bỏ nhịp này.
  private pollInFlight = false;

  private async poll() {
    if (this.state !== 'running') return;
    if (this.pollInFlight) return;

    if (bleService.getLinkQuality() === 'poor') {
      this.skipBeat = !this.skipBeat;
      if (this.skipBeat) return;
      // Nhịp bị bỏ vẫn được tính đúng khoảng cách: elapsedMs đo theo lastTimestamp
      // thật và bị chặn trần 2x POLL_INTERVAL_MS ở dưới.
    } else {
      this.skipBeat = false;
    }

    this.pollInFlight = true;
    try {
      const snapshot = await readSnapshot();
      this.snapshots.push(snapshot);
      this.onSnapshot?.(snapshot);

      const now = Date.now();
      const elapsedMs = this.lastTimestamp ? now - this.lastTimestamp : POLL_INTERVAL_MS;
      this.lastTimestamp = now;

      if (this.fuelLevelStart === null && snapshot.fuelLevelPct !== null) {
        this.fuelLevelStart = snapshot.fuelLevelPct;
      }

      if (snapshot.speedKmh !== null && snapshot.speedKmh > 0) {
        // Cap elapsedMs at 2x poll interval to guard against any remaining
        // timing edge cases (e.g. device sleep that slips through AppState).
        const safeElapsedMs = Math.min(elapsedMs, POLL_INTERVAL_MS * 2);
        const distanceThisInterval = (snapshot.speedKmh / 3600) * (safeElapsedMs / 1000);
        this.distanceKm += distanceThisInterval;
        this.lastSpeedReading = snapshot.speedKmh;
        this.idleStartTime = null;
      }

      // Chỉ đánh giá idle khi ĐỌC RPM THÀNH CÔNG. Snapshot đọc lỗi (rpm null vì adapter
      // rớt tạm thời) KHÔNG được coi là idle - nếu không một loạt đọc lỗi 30s sẽ tự kết
      // thúc chuyến giữa chừng. Đọc lỗi = thoáng qua: bỏ qua, giữ nguyên bộ đếm, vẫn ghi.
      if (snapshot.rpm !== null) {
        if (snapshot.rpm < IDLE_RPM_THRESHOLD) {
          if (this.idleStartTime === null) {
            this.idleStartTime = now;
          } else if (now - this.idleStartTime >= IDLE_STOP_DELAY_MS) {
            this.state = 'stopping';
            this.finalize();
            return;
          }
          this.idleMs += elapsedMs;
        } else {
          this.idleStartTime = null;
        }
      }

      // DTC: đọc SỚM ở vòng thứ 2 (user thấy lỗi ngay đầu chuyến + log phiên nào
      // cũng có mẫu mode 03), sau đó lặp lại mỗi 5 phút.
      if (
        this.snapshots.length === 2 ||
        this.snapshots.length % Math.round(300000 / POLL_INTERVAL_MS) === 0
      ) {
        const codes = await readDtcCodes();
        if (codes.length > 0) {
          this.dtcCodes = codes;
          this.onDtcFound?.(codes);
        }
      }
    } catch {
      // Swallow poll errors - connection may have briefly dropped
    } finally {
      this.pollInFlight = false;
    }
  }

  private finalize() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;

    if (!this.startedAt || this.snapshots.length === 0) {
      this.state = 'stopped';
      return;
    }

    const now = new Date();
    const speeds = this.snapshots.map((s) => s.speedKmh).filter((s): s is number => s !== null);
    const loads  = this.snapshots.map((s) => s.engineLoadPct).filter((s): s is number => s !== null);
    const temps  = this.snapshots.map((s) => s.coolantTempC).filter((s): s is number => s !== null);

    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const avgLoad  = loads.length > 0 ? loads.reduce((a, b) => a + b, 0) / loads.length : null;
    const avgTemp  = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

    const totalMs   = now.getTime() - this.startedAt.getTime();
    const drivingMs = totalMs - this.idleMs;

    const lastFuel = this.snapshots
      .slice()
      .reverse()
      .find((s) => s.fuelLevelPct !== null)?.fuelLevelPct ?? null;

    const summary: TripSummary = {
      vehicleId: this.vehicleId,
      startedAt: this.startedAt.toISOString(),
      endedAt: now.toISOString(),
      distanceKm: Math.round(this.distanceKm * 10) / 10,
      avgSpeedKmh: Math.round(avgSpeed),
      maxSpeedKmh: Math.round(maxSpeed),
      avgEngineLoad: avgLoad !== null ? Math.round(avgLoad) : null,
      avgCoolantTemp: avgTemp !== null ? Math.round(avgTemp) : null,
      fuelLevelStart: this.fuelLevelStart,
      fuelLevelEnd: lastFuel,
      idleTimeSeconds: Math.round(this.idleMs / 1000),
      drivingTimeSeconds: Math.round(drivingMs / 1000),
      snapshots: this.snapshots,
      dtcCodes: this.dtcCodes,
    };

    this.state = 'stopped';
    this.onTripEnd?.(summary);
  }

  getState(): SessionState {
    return this.state;
  }

  getCurrentDistanceKm(): number {
    return Math.round(this.distanceKm * 10) / 10;
  }
}
