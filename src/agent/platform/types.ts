/**
 * PlatformAdapter (docs/nori-agent-plan.md mục 8): hợp đồng I/O thuần khiết, tách khỏi lõi
 * NoriAgent/ToolRegistry. Adapter điện thoại (Phase 1-3) implement bằng obdLiveMonitor thật;
 * MockVehicleAdapter implement cùng interface bằng dữ liệu giả cho TestHarness/CI. Tương lai
 * (ESP32/XiaoZhi, head-unit Android, Linux) chỉ cần cài lại 2 interface này - lõi không đổi.
 */

export type VehicleSnapshot = {
  rpm: number | null;
  speedKmh: number | null;
  coolantTempC: number | null;
  fuelLevelPct: number | null;
  controlModuleVoltage: number | null;
  timestamp: number;
};

export type Unsubscribe = () => void;

export type VehicleReadinessMonitor = { key: string; supported: boolean; ready: boolean };

export type VehicleReadiness = {
  milOn: boolean;
  dtcCount: number;
  ignitionType: 'spark' | 'compression';
  monitors: VehicleReadinessMonitor[];
};

/** Đọc snapshot từ Vehicle Cache - KHÔNG tự poll, chỉ đọc lại giá trị obdLiveMonitor đã có sẵn. */
export interface IVehicleIO {
  getSnapshot(): VehicleSnapshot | null;
  isConnected(): boolean;
  readDtcCodes(): Promise<{ code: string; description: string | null }[]>;
  /** Mode 01 PID 01 - đọc trực tiếp từ xe (không cache), giống readDtcCodes(). */
  readReadinessStatus(): Promise<VehicleReadiness | null>;
  subscribe(cb: (snapshot: VehicleSnapshot) => void): Unsubscribe;
}

/** Voice (Phase 3, chưa dùng ở Phase 1) - khai báo trước để nối STT/TTS sau không phải viết lại lõi. */
export interface IVoiceIO {
  listen(): Promise<string>;
  speak(text: string): Promise<void>;
}

/** Chat dạng text (Phase 1) - dùng chung lõi NoriAgent với IVoiceIO qua cùng 1 adapter khác. */
export interface ITextIO {
  onUserMessage(cb: (text: string) => void): Unsubscribe;
  showAssistantMessage(text: string): void;
}
