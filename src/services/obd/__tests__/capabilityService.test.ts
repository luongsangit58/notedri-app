/**
 * R8 capability discovery - toàn vẹn khi rớt gói BLE giữa chừng (rà soát 14/7):
 * lỗi trang sau KHÔNG được ghi đè cache bằng danh sách PID cụt.
 */
const mockResponses: Record<string, string | Error> = {};
let mockVinCallCount = 0;
let mockDisconnectCallback: (() => void) | null = null;

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => {
      if (cmd === '0902') mockVinCallCount++;
      const v = mockResponses[cmd];
      if (v instanceof Error) return Promise.reject(v);
      if (v === undefined) return Promise.resolve('NO DATA');
      return Promise.resolve(v);
    },
    // Cache VIN theo phiên (15/7) đăng ký listener ở module scope khi import.
    addDisconnectListener: (fn: () => void) => { mockDisconnectCallback = fn; return () => {}; },
  },
}));

function freshModule() {
  jest.resetModules();
  mockVinCallCount = 0;
  mockDisconnectCallback = null;
  return {
    ...require('../capabilityService'),
    AsyncStorage: require('@react-native-async-storage/async-storage'),
  };
}

describe('discoverCapability - rớt gói giữa chừng', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockResponses)) delete mockResponses[k];
  });

  it('dò trọn vẹn -> cache lại (phiên sau đọc được từ cache)', async () => {
    // 0100 bitmap có bit "20" bật (còn trang 0120), 0120 không còn trang tiếp.
    // 4100 80000000 -> chỉ PID 01. Nhưng cần bit 0x20 để sang trang 2: bit index
    // của PID 0x20 = 31 (bit cuối) -> byte cuối lẻ. Dùng bitmap có cả 01 và 20.
    mockResponses['0100'] = '4100 80000001'; // PID 01 + PID 20 (sang trang 0120)
    mockResponses['0120'] = '4120 00000000'; // trang 0120 rỗng -> dừng hợp lệ
    mockResponses['0902'] = 'NO DATA';

    const { discoverCapability, getCachedCapability } = freshModule();
    const cap = await discoverCapability(7);
    expect(cap).not.toBeNull();
    expect(cap.supportedPids).toContain('01');

    const cached = await getCachedCapability(7);
    expect(cached).not.toBeNull();
    expect(cached.supportedPids).toEqual(cap.supportedPids);
  });

  it('trang 0120 LỖI giữa chừng -> KHÔNG cache bản cụt (phiên sau dò lại)', async () => {
    mockResponses['0100'] = '4100 80000001'; // có PID 01 + báo còn trang 0120
    mockResponses['0120'] = new Error('BLE timeout'); // rớt gói
    mockResponses['0902'] = 'NO DATA';

    const { discoverCapability, getCachedCapability } = freshModule();
    const cap = await discoverCapability(8);
    // Vẫn trả phần đã có cho phiên hiện tại dùng tạm...
    expect(cap).not.toBeNull();
    expect(cap.supportedPids).toContain('01');
    // ...nhưng KHÔNG ghi cache (để phiên sau dò lại đầy đủ).
    const cached = await getCachedCapability(8);
    expect(cached).toBeNull();
  });

  it('trang ĐẦU (0100) lỗi -> null (chưa có gì)', async () => {
    mockResponses['0100'] = new Error('BLE timeout');
    const { discoverCapability } = freshModule();
    expect(await discoverCapability(9)).toBeNull();
  });
});

describe('readCurrentVin - cache theo phiên BLE (15/7, sửa 0902 bị gửi trùng)', () => {
  const VIN_RESPONSE = '014\r0:4902014D5248\r1:474B353833304A\r2:54303430303035'; // MRHGK5830JT040005

  beforeEach(() => {
    for (const k of Object.keys(mockResponses)) delete mockResponses[k];
    mockResponses['0902'] = VIN_RESPONSE;
  });

  it('gọi readCurrentVin() nhiều lần trong CÙNG phiên chỉ gửi 0902 đúng 1 lần', async () => {
    const { readCurrentVin } = freshModule();
    const v1 = await readCurrentVin();
    const v2 = await readCurrentVin();
    const v3 = await readCurrentVin();
    expect(v1).toBe('MRHGK5830JT040005');
    expect(v2).toBe('MRHGK5830JT040005');
    expect(v3).toBe('MRHGK5830JT040005');
    expect(mockVinCallCount).toBe(1);
  });

  it('ngắt kết nối (disconnect) -> phiên mới, gọi lại readCurrentVin() gửi 0902 lần nữa', async () => {
    const { readCurrentVin } = freshModule();
    await readCurrentVin();
    expect(mockVinCallCount).toBe(1);

    mockDisconnectCallback?.(); // mô phỏng BleService báo ngắt kết nối
    await readCurrentVin();
    expect(mockVinCallCount).toBe(2);
  });

  it('invalidateVinCache() buộc đọc lại dù còn trong cùng phiên (user force refresh)', async () => {
    const { readCurrentVin, invalidateVinCache } = freshModule();
    await readCurrentVin();
    expect(mockVinCallCount).toBe(1);

    invalidateVinCache();
    await readCurrentVin();
    expect(mockVinCallCount).toBe(2);
  });

  it('lỗi đọc VIN KHÔNG được cache - lần gọi sau vẫn thử lại thật (đừng khoá cứng "không đọc được")', async () => {
    mockResponses['0902'] = new Error('BLE timeout');
    const { readCurrentVin } = freshModule();
    expect(await readCurrentVin()).toBeNull();
    expect(mockVinCallCount).toBe(1);

    mockResponses['0902'] = VIN_RESPONSE; // adapter hồi phục
    expect(await readCurrentVin()).toBe('MRHGK5830JT040005');
    expect(mockVinCallCount).toBe(2);
  });

  it('discoverCapability() dùng CHUNG cache VIN - không gửi 0902 lần 2 nếu đã đọc trong phiên', async () => {
    mockResponses['0100'] = '410080000000'; // 4 byte bitmap, chỉ bit PID 01 bật - đủ để supported.length > 0
    const { readCurrentVin, discoverCapability } = freshModule();
    await readCurrentVin(); // đọc VIN trước (vd trong initializeElm327)
    expect(mockVinCallCount).toBe(1);

    const cap = await discoverCapability(11);
    expect(cap?.vin).toBe('MRHGK5830JT040005');
    expect(mockVinCallCount).toBe(1); // KHÔNG gửi 0902 lần 2
  });
});
