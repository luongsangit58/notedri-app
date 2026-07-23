/**
 * PID 5E (fuel rate, rà soát 23/7) - đã có decoder từ trước (ObdReader.readFuelRate)
 * nhưng chưa từng vào tổng hợp phiên, chỉ hiện ở màn kỹ thuật. Giờ đọc chung tầng
 * slow (fuelLevel/oilTemp/ambientTemp) và tích luỹ fuel_used_liters_est bằng tích
 * phân rate(L/h) theo THỜI GIAN THỰC giữa 2 lần đọc slow tier (Date.now()), cùng
 * nguyên tắc "gap nền" ở poll() medium (obdLiveMonitorResilience.test.ts).
 */

const validSnapshot = {
  rpm: 800, speedKmh: 0, engineLoadPct: 20, coolantTempC: 84, fuelLevelPct: 50,
  oilTempC: 90, throttlePct: 15, controlModuleVoltage: 14.2, timestamp: 0,
};

let mockFuelRate: number | null = 6;

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
  readSnapshot: async () => validSnapshot,
  readDtcCodes: async () => [],
  readPendingDtcCodes: async () => [],
  readPermanentDtcCodes: async () => [],
  readFreezeFrame: async () => ({
    rpm: null, speedKmh: null, coolantTempC: null,
    engineLoadPct: null, fuelTrimShortB1Pct: null, controlModuleVoltage: null,
  }),
  readRpm: async () => null,
  readSpeed: async () => null,
  readThrottle: async () => null,
  readFuelLevel: async () => 50,
  readOilTemp: async () => 90,
  readAmbientAirTemp: async () => 28,
  readFuelRate: async () => mockFuelRate,
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

describe('obdLiveMonitor - fuel rate (PID 5E) vào tổng hợp phiên', () => {
  beforeEach(() => {
    mockFuelRate = 6;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('lần đọc slow tier ĐẦU TIÊN chỉ ghi nhận rate, chưa tích lít (chưa có mốc trước đó)', async () => {
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(45000); // slow tier tick #1

    const summary = buildSessionSummary();
    expect(summary!.fuel_rate_avg).toBe(6);
    expect(summary!.fuel_used_liters_est).toBe(0);
  });

  it('2 lần đọc liên tiếp cùng rate -> tích lít = rate * giờ trôi qua giữa 2 lần đọc', async () => {
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(45000); // tick #1: chưa tích
    await jest.advanceTimersByTimeAsync(45000); // tick #2: tích 45s ở rate 6L/h

    const summary = buildSessionSummary();
    const expectedLiters = 6 * (45000 / 3_600_000);
    expect(summary!.fuel_used_liters_est).toBeCloseTo(expectedLiters, 2);
    expect(summary!.fuel_rate_avg).toBe(6);
  });

  it('xe không hỗ trợ PID 5E (NO DATA -> null xuyên suốt) -> fuel_rate_avg/fuel_used_liters_est đều null, không phải 0', async () => {
    mockFuelRate = null;
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(45000);
    await jest.advanceTimersByTimeAsync(45000);

    const summary = buildSessionSummary();
    expect(summary!.fuel_rate_avg).toBeNull();
    expect(summary!.fuel_used_liters_est).toBeNull();
  });

  it('1 lần đọc null xen giữa (mất sóng thoáng qua) -> bỏ qua đúng khoảng đó, không cộng dồn nhầm khi đọc lại được', async () => {
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(45000); // tick #1: rate=6, chưa tích
    mockFuelRate = null;
    await jest.advanceTimersByTimeAsync(45000); // tick #2: NO DATA - không tích, mốc reset
    mockFuelRate = 6;
    await jest.advanceTimersByTimeAsync(45000); // tick #3: đọc lại được, nhưng mốc trước là null -> chưa tích lần này

    const summary = buildSessionSummary();
    // Chỉ 2/3 lần đọc thành công (rate=6) tính vào trung bình - lần null bị loại.
    expect(summary!.fuel_rate_avg).toBe(6);
    expect(summary!.fuel_used_liters_est).toBe(0);
  });
});
