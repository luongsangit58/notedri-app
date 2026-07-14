/**
 * R8 capability discovery - toàn vẹn khi rớt gói BLE giữa chừng (rà soát 14/7):
 * lỗi trang sau KHÔNG được ghi đè cache bằng danh sách PID cụt.
 */
const mockResponses: Record<string, string | Error> = {};

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => {
      const v = mockResponses[cmd];
      if (v instanceof Error) return Promise.reject(v);
      if (v === undefined) return Promise.resolve('NO DATA');
      return Promise.resolve(v);
    },
  },
}));

function freshModule() {
  jest.resetModules();
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
