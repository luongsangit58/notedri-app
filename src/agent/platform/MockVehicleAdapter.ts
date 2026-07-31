import { IVehicleIO, VehicleSnapshot, VehicleReadiness, Unsubscribe } from './types';

/**
 * Adapter giả cho TestHarness/CI (mục 7, mục 8) - dùng để test NoriAgent/ToolRegistry mà không
 * cần xe thật/BLE thật. Cũng dùng được để dev NoriChatScreen trên máy không có OBD cắm sẵn.
 */
export class MockVehicleAdapter implements IVehicleIO {
  private snapshot: VehicleSnapshot | null;
  private connected: boolean;
  private dtcCodes: { code: string; description: string | null }[];
  private readiness: VehicleReadiness | null;
  private listeners = new Set<(s: VehicleSnapshot) => void>();

  constructor(opts?: {
    connected?: boolean;
    snapshot?: Partial<VehicleSnapshot>;
    dtcCodes?: { code: string; description: string | null }[];
    readiness?: VehicleReadiness | null;
  }) {
    this.connected = opts?.connected ?? true;
    this.snapshot = this.connected
      ? {
          rpm: 900,
          speedKmh: 0,
          coolantTempC: 88,
          fuelLevelPct: 62,
          controlModuleVoltage: 14.1,
          timestamp: Date.now(),
          ...opts?.snapshot,
        }
      : null;
    this.dtcCodes = opts?.dtcCodes ?? [];
    this.readiness = opts?.readiness ?? null;
  }

  getSnapshot(): VehicleSnapshot | null {
    return this.snapshot;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async readDtcCodes(): Promise<{ code: string; description: string | null }[]> {
    return this.dtcCodes;
  }

  async readReadinessStatus(): Promise<VehicleReadiness | null> {
    return this.readiness;
  }

  subscribe(cb: (snapshot: VehicleSnapshot) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Chỉ dùng trong kịch bản test (TestHarness) để mô phỏng thay đổi giữa chừng. */
  setSnapshot(patch: Partial<VehicleSnapshot>): void {
    this.connected = true;
    this.snapshot = { ...(this.snapshot ?? { rpm: null, speedKmh: null, coolantTempC: null, fuelLevelPct: null, controlModuleVoltage: null, timestamp: Date.now() }), ...patch, timestamp: Date.now() };
    this.listeners.forEach((fn) => fn(this.snapshot!));
  }

  setDisconnected(): void {
    this.connected = false;
    this.snapshot = null;
  }
}
