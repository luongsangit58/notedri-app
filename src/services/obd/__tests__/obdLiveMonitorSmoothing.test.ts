/**
 * Mục 12 kiểm toán thuật toán 16/07: onSnapshot() (RAW) phải giữ nguyên giá trị
 * tức thời cho rule engine/aggregator; onSmoothedSnapshot() (EWMA) là bản MƯỢT
 * riêng cho gauge hiển thị - không được trộn lẫn 2 luồng này.
 */

const mockSnapshots = [
  { rpm: 800, speedKmh: 0, engineLoadPct: 20, coolantTempC: 85, fuelLevelPct: 50, oilTempC: 90, throttlePct: 15, controlModuleVoltage: 14.2, timestamp: 0 },
  { rpm: 800, speedKmh: 0, engineLoadPct: 20, coolantTempC: 95, fuelLevelPct: 50, oilTempC: 90, throttlePct: 15, controlModuleVoltage: 14.2, timestamp: 0 },
  { rpm: 800, speedKmh: 0, engineLoadPct: 20, coolantTempC: 95, fuelLevelPct: 50, oilTempC: 90, throttlePct: 15, controlModuleVoltage: 14.2, timestamp: 0 },
];
let mockCallIndex = 0;

jest.mock('../BleService', () => ({
  bleService: {
    isConnected: () => true,
    getLinkQuality: () => 'good',
    getSessionAgeSeconds: () => 9,
    addReconnectedListener: () => () => {},
    addDisconnectListener: () => () => {},
    logDiagnostic: () => {},
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
  // Tầng fast (kim đồng hồ, 22/7) - không dùng chung mockCallIndex với
  // readSnapshot, tránh làm lệch chuỗi snapshot medium tier mà test đang giả định.
  readRpm: async () => null,
  readSpeed: async () => null,
  readThrottle: async () => null,
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
const { obdLiveMonitor } = require('../obdLiveMonitor');

describe('obdLiveMonitor - smoothing tách biệt RAW vs gauge hiển thị', () => {
  beforeEach(() => {
    mockCallIndex = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('onSnapshot nhận giá trị RAW tức thời; onSmoothedSnapshot nhận giá trị EWMA đi dần tới đích', async () => {
    const rawCoolants: (number | null)[] = [];
    const smoothedCoolants: (number | null)[] = [];

    const unsubRaw = obdLiveMonitor.onSnapshot((s: any) => rawCoolants.push(s.coolantTempC));
    const unsubSmoothed = obdLiveMonitor.onSmoothedSnapshot((s: any) => smoothedCoolants.push(s.coolantTempC));

    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(3000); // poll #1: coolant 85
    await jest.advanceTimersByTimeAsync(3000); // poll #2: coolant nhảy lên 95
    await jest.advanceTimersByTimeAsync(3000); // poll #3: coolant giữ 95

    // RAW: nhảy NGAY 85 -> 95 ở poll #2, không có độ trễ nào.
    expect(rawCoolants).toEqual([85, 95, 95]);

    // Mượt (EWMA alpha mặc định 0.3): poll #1 = 85 (điểm đầu), poll #2 chỉ đi được
    // 1 phần đường tới 95 (0.3*95+0.7*85=88), poll #3 tiếp tục tiến gần 95 hơn -
    // KHÔNG nhảy thẳng như RAW.
    expect(smoothedCoolants[0]).toBe(85);
    expect(smoothedCoolants[1]).toBeCloseTo(88, 5);
    expect(smoothedCoolants[1]).toBeGreaterThan(85);
    expect(smoothedCoolants[1]).toBeLessThan(95);
    expect(smoothedCoolants[2]).toBeGreaterThan(smoothedCoolants[1] as number);
    expect(smoothedCoolants[2]).toBeLessThan(95);

    unsubRaw();
    unsubSmoothed();
  });
});
