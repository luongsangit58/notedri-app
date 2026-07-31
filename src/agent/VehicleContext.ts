import { obdLiveMonitor } from '../services/obd/obdLiveMonitor';
import { bleService } from '../services/obd/BleService';
import { readDtcCodes, readReadinessStatus } from '../services/obd/ObdReader';
import { IVehicleIO, VehicleSnapshot, VehicleReadiness, Unsubscribe } from './platform/types';

/**
 * Wrapper mỏng đọc snapshot từ obdLiveMonitor (docs/nori-agent-plan.md mục 5, 10.1) - KHÔNG
 * tự poll, chỉ cache lại giá trị mới nhất mà obdLiveMonitor đã phát ra qua onSnapshot/
 * onFastSnapshot/onSlowSnapshot để ToolRegistry đọc đồng bộ (obdLiveMonitor không có getter
 * đồng bộ, chỉ có event listener). BLE và AI độc lập nhau (mục 1): class này chỉ LẮNG NGHE,
 * không bao giờ tự start()/stop() polling.
 */
export class VehicleContext implements IVehicleIO {
  private cached: VehicleSnapshot | null = null;
  private unsubscribers: Unsubscribe[] = [];

  constructor() {
    this.unsubscribers.push(
      obdLiveMonitor.onSnapshot((s) => {
        this.cached = {
          rpm: s.rpm,
          speedKmh: s.speedKmh,
          coolantTempC: s.coolantTempC,
          fuelLevelPct: this.cached?.fuelLevelPct ?? null,
          controlModuleVoltage: s.controlModuleVoltage,
          timestamp: s.timestamp,
        };
      }),
    );
    this.unsubscribers.push(
      obdLiveMonitor.onSlowSnapshot((s) => {
        this.cached = {
          rpm: this.cached?.rpm ?? null,
          speedKmh: this.cached?.speedKmh ?? null,
          coolantTempC: this.cached?.coolantTempC ?? null,
          fuelLevelPct: s.fuelLevelPct,
          controlModuleVoltage: this.cached?.controlModuleVoltage ?? null,
          timestamp: s.timestamp,
        };
      }),
    );
  }

  getSnapshot(): VehicleSnapshot | null {
    if (!bleService.isConnected()) return null;
    return this.cached;
  }

  isConnected(): boolean {
    return bleService.isConnected();
  }

  async readDtcCodes(): Promise<{ code: string; description: string | null }[]> {
    if (!bleService.isConnected()) return [];
    return readDtcCodes();
  }

  async readReadinessStatus(): Promise<VehicleReadiness | null> {
    if (!bleService.isConnected()) return null;
    return readReadinessStatus();
  }

  subscribe(cb: (snapshot: VehicleSnapshot) => void): Unsubscribe {
    // Phase 1 chưa có UI cần subscribe qua VehicleContext (tool đọc theo yêu cầu, không stream) -
    // giữ hàm để thoả IVehicleIO/PlatformAdapter, sẵn sàng cho Phase voice/proactive sau này.
    return () => {};
  }

  /** Gọi khi NoriAgent bị huỷ (unmount màn chat) để không rò rỉ listener trên obdLiveMonitor. */
  dispose(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
  }

  getActiveVehicleId(): number | null {
    return obdLiveMonitor.getVehicleId();
  }
}
