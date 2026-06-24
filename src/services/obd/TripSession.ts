import { readSnapshot, readDtcCodes, ObdSnapshot, DtcCode } from './ObdReader';

const POLL_INTERVAL_MS = 3000;
const IDLE_RPM_THRESHOLD = 200; // RPM below this = engine off
const IDLE_STOP_DELAY_MS = 30000; // 30s of idle RPM before ending trip

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

    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop() {
    this.state = 'stopping';
    this.finalize();
  }

  private async poll() {
    if (this.state !== 'running') return;

    try {
      const snapshot = await readSnapshot();
      this.snapshots.push(snapshot);
      this.onSnapshot?.(snapshot);

      const now = Date.now();
      const elapsedMs = this.lastTimestamp ? now - this.lastTimestamp : POLL_INTERVAL_MS;
      this.lastTimestamp = now;

      // Record fuel level at trip start
      if (this.fuelLevelStart === null && snapshot.fuelLevelPct !== null) {
        this.fuelLevelStart = snapshot.fuelLevelPct;
      }

      // Calculate distance from speed integration
      if (snapshot.speedKmh !== null && snapshot.speedKmh > 0) {
        const distanceThisInterval = (snapshot.speedKmh / 3600) * (elapsedMs / 1000);
        this.distanceKm += distanceThisInterval;
        this.lastSpeedReading = snapshot.speedKmh;
        this.idleStartTime = null;
      }

      // Detect engine idle/off
      const rpm = snapshot.rpm ?? 0;
      if (rpm < IDLE_RPM_THRESHOLD) {
        if (this.idleStartTime === null) {
          this.idleStartTime = now;
        } else if (now - this.idleStartTime >= IDLE_STOP_DELAY_MS) {
          // Engine has been off for 30s - end trip automatically
          this.state = 'stopping';
          this.finalize();
          return;
        }
        this.idleMs += elapsedMs;
      } else {
        this.idleStartTime = null;
      }

      // Read DTCs every 5 minutes
      if (this.snapshots.length % Math.round(300000 / POLL_INTERVAL_MS) === 0) {
        const codes = await readDtcCodes();
        if (codes.length > 0) {
          this.dtcCodes = codes;
          this.onDtcFound?.(codes);
        }
      }
    } catch {
      // Swallow poll errors - connection may have briefly dropped
    }
  }

  private finalize() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (!this.startedAt || this.snapshots.length === 0) {
      this.state = 'stopped';
      return;
    }

    const now = new Date();
    const speeds = this.snapshots
      .map((s) => s.speedKmh)
      .filter((s): s is number => s !== null);
    const loads = this.snapshots
      .map((s) => s.engineLoadPct)
      .filter((s): s is number => s !== null);
    const temps = this.snapshots
      .map((s) => s.coolantTempC)
      .filter((s): s is number => s !== null);

    const avgSpeed = speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
    const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
    const avgLoad = loads.length > 0 ? loads.reduce((a, b) => a + b, 0) / loads.length : null;
    const avgTemp = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : null;

    const totalMs = now.getTime() - this.startedAt.getTime();
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
