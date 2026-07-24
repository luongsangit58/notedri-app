/**
 * Hai hành vi hoá giải bài học fixture #5 (JS timer bị OS đóng băng khi app
 * vào nền, xem obdLiveMonitor.ts): (1) gap thực tế giữa 2 poll được tích vào
 * session summary thay vì âm thầm trôi qua, (2) toàn bộ PID null liên tiếp
 * (đúng đuôi fixture: ~9s NO DATA rồi phiên dừng) bắn 1 sự kiện cho tầng trên
 * thay vì tiếp tục hiển thị loading vô thời hạn.
 *
 * Dùng doNotFake: ['Date'] + spy Date.now() để điều khiển mốc thời gian ĐỘC
 * LẬP với nhịp advanceTimersByTimeAsync - nếu để jest fake luôn Date thì mọi
 * lần advance sẽ luôn cách nhau đúng 3000ms, không mô phỏng được gap bất
 * thường (chính là thứ jest fake timers "chuẩn" không thể tạo ra).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const validSnapshot = {
  rpm: 800, speedKmh: 0, engineLoadPct: 20, coolantTempC: 84, fuelLevelPct: 50,
  oilTempC: 90, throttlePct: 15, controlModuleVoltage: 14.2, timestamp: 0,
};

const allNullSnapshot = {
  rpm: null, speedKmh: null, engineLoadPct: null, coolantTempC: null, fuelLevelPct: null,
  oilTempC: null, throttlePct: null, controlModuleVoltage: null, timestamp: 0,
};

let mockAllNull = false;

jest.mock('../BleService', () => ({
  bleService: {
    isConnected: () => true,
    getLinkQuality: () => 'good',
    getSessionAgeSeconds: () => 9,
    getDeviceName: () => 'IOS-Vlink',
    addReconnectedListener: () => () => {},
    addDisconnectListener: () => () => {},
    logDiagnostic: () => {},
  },
}));

jest.mock('../ObdReader', () => ({
  readSnapshot: async () => (mockAllNull ? allNullSnapshot : validSnapshot),
  readDtcCodes: async () => [],
  readPendingDtcCodes: async () => [],
  readPermanentDtcCodes: async () => [],
  readFreezeFrame: async () => ({
    rpm: null, speedKmh: null, coolantTempC: null,
    engineLoadPct: null, fuelTrimShortB1Pct: null, controlModuleVoltage: null,
  }),
  // Tầng fast (kim đồng hồ, 22/7) - giá trị trung lập, không ảnh hưởng test.
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
const { obdLiveMonitor, buildSessionSummary } = require('../obdLiveMonitor');

describe('obdLiveMonitor - gap nền (fixture #5)', () => {
  let mockNow = 0;

  // Cộng dồn mockNow VÀ advance timer trong CÙNG 1 lệnh gọi - tách rời 2 việc
  // này ra 2 dòng riêng dễ lệch nhau khi sửa test sau này (rà soát Blind Hunter).
  // gapFromPrevMs: khoảng cách so với lần tick() TRƯỚC, mặc định đúng nhịp poll
  // 3000ms (không có gap) - chỉ truyền giá trị khác khi cố ý mô phỏng gap.
  async function tick(gapFromPrevMs = 3000): Promise<void> {
    mockNow += gapFromPrevMs;
    await jest.advanceTimersByTimeAsync(3000);
  }

  beforeEach(() => {
    mockAllNull = false;
    mockNow = 1000;
    jest.useFakeTimers({ doNotFake: ['Date'] });
    jest.spyOn(Date, 'now').mockImplementation(() => mockNow);
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('JS timer đóng băng 150s giữa 2 poll -> ghi nhận đúng 1 gap nền, đúng số giây', async () => {
    obdLiveMonitor.start(1);

    await tick(); // poll #1 - chưa có mốc trước đó, không tính gap
    await tick(150000); // poll #2, cách 150s (đúng khoảng trống lớn nhất fixture #5, ~1700s cùng cơ chế)

    const summary = buildSessionSummary();
    expect(summary!.background_gap_count).toBe(1);
    expect(summary!.background_gap_seconds_total).toBe(150);
  });

  it('nhịp poll bình thường (~3s liên tiếp) không bị tính là gap nền', async () => {
    obdLiveMonitor.start(1);

    await tick();
    await tick();
    await tick();

    const summary = buildSessionSummary();
    expect(summary!.background_gap_count).toBe(0);
    expect(summary!.background_gap_seconds_total).toBe(0);
  });

  it('đúng ngưỡng 15000ms KHÔNG tính là gap (chặt chẽ ở biên, tránh báo nhầm khi sóng kém khiến nhịp thưa gấp đôi)', async () => {
    obdLiveMonitor.start(1);

    await tick();
    await tick(15000); // == ngưỡng, không phải > ngưỡng

    const summary = buildSessionSummary();
    expect(summary!.background_gap_count).toBe(0);
  });

  it('vượt ngưỡng 1ms (15001ms) tính là gap nền', async () => {
    obdLiveMonitor.start(1);

    await tick();
    await tick(15001);

    const summary = buildSessionSummary();
    expect(summary!.background_gap_count).toBe(1);
  });
});

describe('obdLiveMonitor - xe không phản hồi (đuôi fixture #5: NO DATA liên tiếp)', () => {
  beforeEach(() => {
    mockAllNull = false;
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdLiveMonitor.stop();
    jest.useRealTimers();
  });

  it('3 poll liên tiếp toàn bộ PID null -> bắn onVehicleUnresponsive đúng 1 lần, không lặp lại khi vẫn null', async () => {
    mockAllNull = true;
    const handler = jest.fn();
    obdLiveMonitor.onVehicleUnresponsive(handler);
    obdLiveMonitor.start(1);

    await jest.advanceTimersByTimeAsync(3000); // #1 null
    expect(handler).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(3000); // #2 null
    expect(handler).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(3000); // #3 null -> chạm ngưỡng
    expect(handler).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000); // #4 vẫn null - KHÔNG báo lại
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('có PID đọc lại được (máy nổ lại) reset bộ đếm, cho phép báo lại nếu mất tiếp', async () => {
    const handler = jest.fn();
    obdLiveMonitor.onVehicleUnresponsive(handler);

    mockAllNull = true;
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000); // báo lần 1
    expect(handler).toHaveBeenCalledTimes(1);

    mockAllNull = false;
    await jest.advanceTimersByTimeAsync(3000); // đọc được lại -> reset bộ đếm

    mockAllNull = true;
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000); // mất tiếp đủ 3 lần -> báo lần 2
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('gọi hàm unsubscribe trả về từ onVehicleUnresponsive() thì KHÔNG còn nhận báo nữa', async () => {
    mockAllNull = true;
    const handler = jest.fn();
    const unsubscribe = obdLiveMonitor.onVehicleUnresponsive(handler);
    unsubscribe();
    obdLiveMonitor.start(1);

    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(3000); // đã đủ ngưỡng nhưng handler đã unsubscribe

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('obdLiveMonitor - checkpoint phiên (rà soát 24/7: app bị kill giữa phiên không rút cáp đàng hoàng -> mất trắng, không dấu vết)', () => {
  beforeEach(async () => {
    mockAllNull = false;
    jest.useFakeTimers();
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    obdLiveMonitor.stop();
    await jest.advanceTimersByTimeAsync(0);
    jest.useRealTimers();
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('ghi checkpoint định kỳ (60s) trong lúc phiên đang sống', async () => {
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(3000); // vài poll để có dữ liệu cho buildSessionSummary
    await jest.advanceTimersByTimeAsync(60000); // đủ 1 chu kỳ checkpoint

    const raw = await AsyncStorage.getItem('obd_session_checkpoint');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).vehicleId).toBe(1);
  });

  it('kết thúc phiên bình thường (stop()) xoá sạch checkpoint - không đẩy trùng ở lần start() kế tiếp', async () => {
    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(3000);
    await jest.advanceTimersByTimeAsync(60000);
    expect(await AsyncStorage.getItem('obd_session_checkpoint')).not.toBeNull();

    obdLiveMonitor.stop();
    await jest.advanceTimersByTimeAsync(0);

    expect(await AsyncStorage.getItem('obd_session_checkpoint')).toBeNull();
  });

  it('checkpoint còn sót từ lần app chạy TRƯỚC (app bị kill giữa phiên) được đẩy vào hàng đợi offline khi bắt đầu phiên mới, rồi tự dọn', async () => {
    const orphaned = {
      vehicleId: 42,
      deviceName: 'IOS-Vlink',
      startedAt: Date.now() - 120000,
      summary: { samples: 10, coolant_max: 85 },
    };
    await AsyncStorage.setItem('obd_session_checkpoint', JSON.stringify(orphaned));

    obdLiveMonitor.start(1);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(0);

    // checkpoint cũ đã "tiêu thụ" - không còn sót lại để đẩy trùng lần sau
    expect(await AsyncStorage.getItem('obd_session_checkpoint')).toBeNull();

    // phiên mồ côi đó phải nằm trong hàng đợi offline (obd_pending_sessions) - cùng
    // hàng đợi ObdSessionSyncQueue.ts dùng cho phiên kết thúc bình thường
    const pendingRaw = await AsyncStorage.getItem('obd_pending_sessions');
    expect(pendingRaw).not.toBeNull();
    const pending = JSON.parse(pendingRaw as string);
    expect(pending.some((p: any) => p.vehicle_id === 42)).toBe(true);
  });
});
