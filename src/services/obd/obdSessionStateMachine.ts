import { createLogger } from './obdLogger';

const log = createLogger('knowledge');

/**
 * Vehicle Session State Machine (mục 4 yêu cầu cải tiến). Trước đây chỉ có
 * SessionPhase rút gọn (engine_off|idle|driving, xem obdLiveMonitor.ts) và vài
 * boolean rời rạc (BleService.connecting/reconnecting, useObd's
 * ConnectionState) - không có nơi nào giữ MỘT trạng thái phiên xe duy nhất.
 * Module này KHÔNG thay bất kỳ logic BLE/ELM/poll nào - chỉ là 1 lớp mỏng
 * được các nơi đó gọi vào để cập nhật, cho Knowledge Engine đọc sau này.
 */

export type VehicleSessionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ELM_READY'
  | 'ENGINE_OFF'
  | 'ENGINE_IDLE'
  | 'DRIVING'
  | 'STOPPED';

export type StateHistoryEntry = { state: VehicleSessionState; at: number };

// Giới hạn lịch sử để tránh phình bộ nhớ trên phiên rất dài (giống cách các
// Agg khác trong obdLiveMonitor.ts không giữ mảng thô không giới hạn).
const MAX_HISTORY = 200;

// Cạnh hợp lệ theo đúng sơ đồ yêu cầu: DISCONNECTED -> CONNECTING -> CONNECTED
// -> ELM_READY -> {ENGINE_OFF <-> ENGINE_IDLE <-> DRIVING} -> STOPPED ->
// DISCONNECTED. 3 trạng thái máy (ENGINE_OFF/ENGINE_IDLE/DRIVING) qua lại tự
// do với nhau vì thực tế xe tắt/nổ máy/chạy/dừng đèn đỏ nhiều lần trong 1
// phiên, không phải đường thẳng 1 chiều như hình vẽ minh hoạ.
const VALID_TRANSITIONS: Record<VehicleSessionState, VehicleSessionState[]> = {
  DISCONNECTED: ['CONNECTING'],
  CONNECTING: ['CONNECTED', 'DISCONNECTED'],
  CONNECTED: ['ELM_READY', 'DISCONNECTED'],
  ELM_READY: ['ENGINE_OFF', 'ENGINE_IDLE', 'DRIVING', 'DISCONNECTED'],
  ENGINE_OFF: ['ENGINE_IDLE', 'DRIVING', 'STOPPED', 'DISCONNECTED'],
  ENGINE_IDLE: ['ENGINE_OFF', 'DRIVING', 'STOPPED', 'DISCONNECTED'],
  DRIVING: ['ENGINE_OFF', 'ENGINE_IDLE', 'STOPPED', 'DISCONNECTED'],
  STOPPED: ['DISCONNECTED'],
};

let state: VehicleSessionState = 'DISCONNECTED';
let history: StateHistoryEntry[] = [];
const listeners = new Set<(s: VehicleSessionState) => void>();

function setState(next: VehicleSessionState): void {
  if (next === state) return;
  if (!VALID_TRANSITIONS[state].includes(next)) {
    // Cạnh không hợp lệ theo sơ đồ - bỏ qua thay vì throw, vì tín hiệu nguồn
    // (rpm/speed/BLE) có thể tới không đúng thứ tự lý tưởng (VD reconnect khi
    // đang DRIVING quay lại luôn CONNECTED). Log để phát hiện khi audit.
    log.debug(`ignored invalid transition ${state} -> ${next}`);
    return;
  }
  state = next;
  history.push({ state, at: Date.now() });
  if (history.length > MAX_HISTORY) history.shift();
  log.info(`state -> ${next}`);
  listeners.forEach((fn) => fn(next));
}

export const obdSessionStateMachine = {
  getState(): VehicleSessionState {
    return state;
  },

  getHistory(): StateHistoryEntry[] {
    return [...history];
  },

  subscribe(fn: (s: VehicleSessionState) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  reset(): void {
    state = 'DISCONNECTED';
    history = [];
  },

  /** Xoá lịch sử ĐẦU phiên mới nhưng giữ nguyên trạng thái hiện tại (BLE có
   * thể đã CONNECTED/ELM_READY trước khi obdLiveMonitor.start() chạy) - dùng
   * để session_state_history trong buildSessionSummary() không lẫn phiên cũ. */
  clearHistory(): void {
    history = [];
  },

  setConnecting(): void { setState('CONNECTING'); },
  setConnected(): void { setState('CONNECTED'); },
  setElmReady(): void { setState('ELM_READY'); },
  setEngineOff(): void { setState('ENGINE_OFF'); },
  setEngineIdle(): void { setState('ENGINE_IDLE'); },
  setDriving(): void { setState('DRIVING'); },
  setStopped(): void { setState('STOPPED'); },
  setDisconnected(): void { setState('DISCONNECTED'); },
};
