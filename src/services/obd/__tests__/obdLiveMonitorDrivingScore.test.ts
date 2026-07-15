/**
 * Chấm điểm lái xe nguồn OBD (Giai đoạn G): obdLiveMonitor tái dùng đúng tốc
 * độ ECU (PID 0D) đã đọc mỗi 3s cho live-monitor sẵn có để đếm sự kiện phanh
 * gấp/tăng tốc đột ngột - KHÔNG giữ mảng mẫu thô, chỉ tích luỹ số đếm dần theo
 * từng poll (giống các Agg khác trong file). Test giả lập 1 chuỗi tốc độ có
 * đúng 1 cú phanh gấp thật để xác nhận buildSessionSummary() đếm đúng.
 */

const mockSnapshots = [
  { rpm: 2000, speedKmh: 60, engineLoadPct: 40, coolantTempC: 85, fuelLevelPct: 50, oilTempC: 90, throttlePct: 30, controlModuleVoltage: 14.2, timestamp: 0 },
  { rpm: 800, speedKmh: 20, engineLoadPct: 20, coolantTempC: 85, fuelLevelPct: 50, oilTempC: 90, throttlePct: 10, controlModuleVoltage: 14.2, timestamp: 0 },
  { rpm: 800, speedKmh: 18, engineLoadPct: 20, coolantTempC: 85, fuelLevelPct: 50, oilTempC: 90, throttlePct: 10, controlModuleVoltage: 14.2, timestamp: 0 },
];
let mockCallIndex = 0;

jest.mock('../BleService', () => ({
  bleService: {
    isConnected: () => true,
    getLinkQuality: () => 'good',
    getSessionAgeSeconds: () => 9,
    addReconnectedListener: () => () => {},
    addDisconnectListener: () => () => {},
  },
}));

jest.mock('../ObdReader', () => ({
  readSnapshot: async () => mockSnapshots[Math.min(mockCallIndex++, mockSnapshots.length - 1)],
  readDtcCodes: async () => [],
  readPendingDtcCodes: async () => [],
  readPermanentDtcCodes: async () => [],
  readFreezeFrame: async () => ({
    rpm: null, speedKmh: null, coolantTempC: null,
    engineLoadPct: null, fuelTrimShortB1Pct: null, controlModuleVoltage: null,
  }),
  reinitElm327AfterReconnect: async () => {},
}));

jest.mock('../diagnosticRulesStore', () => ({
  getActiveRules: () => [],
  refreshRulesFromServer: async () => {},
}));

jest.mock('../../../api/obd', () => ({
  obdApi: { reportDtc: async () => {}, reportSession: async () => {} },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { obdLiveMonitor, buildSessionSummary } = require('../obdLiveMonitor');

describe('obdLiveMonitor - chấm điểm lái xe từ tốc độ ECU', () => {
  beforeEach(() => {
    mockCallIndex = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('60 -> 20 km/h trong 3s (~-3.7 m/s²) đếm là 1 lần phanh gấp', async () => {
    obdLiveMonitor.start(1);

    // Poll #1 (60km/h) rồi #2 (20km/h, cách 3s -> phanh gấp) rồi #3 (18km/h, giảm nhẹ)
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000);

    const summary = buildSessionSummary();
    expect(summary).not.toBeNull();
    expect(summary!.harsh_brake_count).toBe(1);
    expect(summary!.harsh_accel_count).toBe(0);
    expect(typeof summary!.driving_score).toBe('number');
    // 3 vòng poll, mọi snapshot có rpm>0 -> 3s máy chạy/vòng (POLL_INTERVAL) = 9s.
    expect(summary!.engine_run_seconds).toBe(9);
  });

  it('đổi xe giữa phiên reset luôn bộ đếm phanh gấp (không rò rỉ sang xe mới)', async () => {
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000); // đã có 1 phanh gấp cho xe 1

    obdLiveMonitor.start(2); // đổi xe giữa chừng

    const summary = buildSessionSummary();
    expect(summary?.harsh_brake_count ?? 0).toBe(0);
  });
});
