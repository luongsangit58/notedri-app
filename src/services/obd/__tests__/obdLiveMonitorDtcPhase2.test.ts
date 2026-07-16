/**
 * OBD2 Phase 2 (15/7) trong obdLiveMonitor.ts: session_phase/driving_seconds
 * suy từ rpm/speed mỗi vòng poll, mode 07 (pending) đọc cùng nhịp mode 03,
 * mode 0A (permanent) chỉ đọc 1 lần/phiên, freeze frame (mode 02) chụp 1 lần
 * khi mode 03 phát hiện mã MỚI.
 */

const idleSnapshot = {
  rpm: 800, speedKmh: 0, engineLoadPct: 20, coolantTempC: 84, fuelLevelPct: 50,
  oilTempC: 90, throttlePct: 15, controlModuleVoltage: 14.2, timestamp: 0,
};
const drivingSnapshot = { ...idleSnapshot, speedKmh: 40 };
const engineOffSnapshot = {
  rpm: 0, speedKmh: 0, engineLoadPct: null, coolantTempC: null, fuelLevelPct: null,
  oilTempC: null, throttlePct: null, controlModuleVoltage: 12.6, timestamp: 0,
};

let mockPhaseSnapshot: typeof idleSnapshot | typeof engineOffSnapshot = idleSnapshot;
let mockDtcCodes: { code: string; description: string | null }[] = [];
let mockPendingCodes: { code: string; description: string | null }[] = [];
let mockPermanentCallCount = 0;
let mockFreezeFrameCallCount = 0;

jest.mock('../BleService', () => ({
  bleService: {
    isConnected: () => true,
    getLinkQuality: () => 'good',
    getSessionAgeSeconds: () => 30,
    addReconnectedListener: () => () => {},
    addDisconnectListener: () => () => {},
  },
}));

jest.mock('../ObdReader', () => ({
  readSnapshot: async () => mockPhaseSnapshot,
  readDtcCodes: async () => mockDtcCodes,
  readPendingDtcCodes: async () => mockPendingCodes,
  readPermanentDtcCodes: async () => {
    mockPermanentCallCount++;
    return [];
  },
  readFreezeFrame: async () => {
    mockFreezeFrameCallCount++;
    return {
      rpm: 1750, speedKmh: 60, coolantTempC: 82,
      engineLoadPct: 45, fuelTrimShortB1Pct: 5.5, controlModuleVoltage: 14.3,
    };
  },
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

async function tick(): Promise<void> {
  await jest.advanceTimersByTimeAsync(3000);
}

describe('obdLiveMonitor - Phase 2: session_phase/driving_seconds', () => {
  beforeEach(() => {
    mockPhaseSnapshot = idleSnapshot;
    mockDtcCodes = [];
    mockPendingCodes = [];
    mockPermanentCallCount = 0;
    mockFreezeFrameCallCount = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('máy tắt (rpm=0) -> session_phase engine_off', async () => {
    mockPhaseSnapshot = engineOffSnapshot;
    obdLiveMonitor.start(1);
    await tick();
    expect(obdLiveMonitor.getSessionPhase()).toBe('engine_off');
    expect(buildSessionSummary()!.session_phase).toBe('engine_off');
  });

  it('máy nổ, đứng yên (rpm>0, speed=0) -> idle, KHÔNG cộng driving_seconds', async () => {
    mockPhaseSnapshot = idleSnapshot;
    obdLiveMonitor.start(1);
    await tick();
    await tick();
    expect(obdLiveMonitor.getSessionPhase()).toBe('idle');
    expect(buildSessionSummary()!.driving_seconds).toBe(0);
  });

  it('máy nổ, đang chạy (rpm>0, speed>0) -> driving, cộng dồn driving_seconds đúng nhịp poll', async () => {
    mockPhaseSnapshot = drivingSnapshot;
    obdLiveMonitor.start(1);
    await tick();
    await tick();
    expect(obdLiveMonitor.getSessionPhase()).toBe('driving');
    expect(buildSessionSummary()!.driving_seconds).toBe(6); // 2 vòng x 3s
  });
});

describe('obdLiveMonitor - Phase 2: Mode 07 Pending DTC', () => {
  beforeEach(() => {
    mockPhaseSnapshot = idleSnapshot;
    mockDtcCodes = [];
    mockPendingCodes = [];
    mockPermanentCallCount = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('có mã pending -> pending_dtc_count trong summary, KHÔNG cộng vào dtc_count chính thức', async () => {
    mockPendingCodes = [{ code: 'P0171', description: null }];
    obdLiveMonitor.start(1);
    await tick(); // poll 1
    await tick(); // poll 2 - đúng nhịp đọc DTC (pollCount===2)

    const summary = buildSessionSummary();
    expect(summary!.pending_dtc_count).toBe(1);
    expect(summary!.dtc_count).toBe(0); // mode 03 không có mã nào - không lẫn với pending
  });

  it('onPendingDtcFound() nhận đúng mã', async () => {
    mockPendingCodes = [{ code: 'P0171', description: null }];
    const received: any[] = [];
    const unsub = obdLiveMonitor.onPendingDtcFound((codes: any[]) => received.push(...codes));

    obdLiveMonitor.start(1);
    await tick();
    await tick();

    expect(received).toEqual([{ code: 'P0171', description: null }]);
    unsub();
  });

  it('mã pending tự hết giữa phiên -> pending_dtc_count về lại 0 (rà soát 16/7: trước đây kẹt ở đỉnh cũ)', async () => {
    mockPendingCodes = [{ code: 'P0171', description: null }];
    obdLiveMonitor.start(1);
    await tick(); // poll 1
    await tick(); // poll 2 - lần đọc DTC đầu, có 1 mã pending

    expect(buildSessionSummary()!.pending_dtc_count).toBe(1);

    mockPendingCodes = []; // mã pending tự hết
    for (let i = 0; i < 100; i++) await tick(); // chạm mốc đọc DTC lần 2 (~5 phút)

    expect(buildSessionSummary()!.pending_dtc_count).toBe(0);
  });
});

describe('obdLiveMonitor - Phase 2: Mode 0A Permanent DTC (chỉ đọc 1 lần/phiên)', () => {
  beforeEach(() => {
    mockPhaseSnapshot = idleSnapshot;
    mockDtcCodes = [];
    mockPendingCodes = [];
    mockPermanentCallCount = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('đọc mode 0A đúng 1 lần dù phiên poll qua nhiều vòng kiểm DTC (poll 2 và mốc 5 phút)', async () => {
    obdLiveMonitor.start(1);
    await tick(); // poll 1
    await tick(); // poll 2 - lần đọc DTC đầu tiên (mode 03/07/0A)
    for (let i = 0; i < 100; i++) await tick(); // chạm mốc DTC_EVERY_N_POLLS lần 2

    expect(mockPermanentCallCount).toBe(1);
  });
});

describe('obdLiveMonitor - Phase 2: Freeze Frame (mode 02) khi có DTC MỚI', () => {
  beforeEach(() => {
    mockPhaseSnapshot = idleSnapshot;
    mockDtcCodes = [];
    mockPendingCodes = [];
    mockFreezeFrameCallCount = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('mode 03 phát hiện mã MỚI -> tự đọc freeze frame, lưu vào summary', async () => {
    mockDtcCodes = [{ code: 'P0420', description: null }];
    obdLiveMonitor.start(1);
    await tick();
    await tick();

    expect(mockFreezeFrameCallCount).toBe(1);
    const summary = buildSessionSummary();
    expect(summary!.freeze_frame).toMatchObject({ rpm: 1750, speedKmh: 60, coolantTempC: 82 });
  });

  it('KHÔNG có DTC nào -> không đọc freeze frame, field null trong summary', async () => {
    mockDtcCodes = [];
    obdLiveMonitor.start(1);
    await tick();
    await tick();

    expect(mockFreezeFrameCallCount).toBe(0);
    expect(buildSessionSummary()!.freeze_frame).toBeNull();
  });

  it('mã đã báo rồi lặp lại ở vòng đọc DTC sau -> KHÔNG đọc freeze frame lần 2 (chỉ mã đầu tiên đáng giá)', async () => {
    mockDtcCodes = [{ code: 'P0420', description: null }];
    obdLiveMonitor.start(1);
    await tick();
    await tick(); // freeze frame #1

    for (let i = 0; i < 100; i++) await tick(); // chạm mốc đọc DTC lần 2 - vẫn cùng mã P0420 (không mới)

    expect(mockFreezeFrameCallCount).toBe(1);
  });
});
