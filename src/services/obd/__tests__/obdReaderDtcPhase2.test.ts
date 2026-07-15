/**
 * OBD2 Phase 2 (15/7): Mode 07 (Pending DTC), Mode 0A (Permanent DTC), Freeze
 * Frame (Mode 02) - tái dùng payload/parser mode 03 và extractPayload() đã có
 * (generic theo mode), không sửa BLE/ELM/PID Parser gốc.
 */
const responses: Record<string, string> = {
  '07': '470171', // 1 mã pending: P0171
  '0A': '4A017104200000', // 2 mã permanent: P0171, P0420
  // Freeze frame (mode 02, frame 0) - cùng công thức PID_REGISTRY, khác byte echo (41->42)
  '020C00': '420C1B58', // RPM = (0x1B*256+0x58)/4 = 1750
  '020D00': '420D3C', // Speed = 60 km/h
  '020500': '42057A', // Coolant = 0x7A-40 = 82°C
};

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => Promise.resolve(responses[cmd] ?? 'NO DATA'),
    addDisconnectListener: () => () => {},
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  readPendingDtcCodes,
  readPermanentDtcCodes,
  readFreezeFrame,
  setActivePidWhitelist,
} = require('../ObdReader');

describe('Mode 07 - Pending DTC', () => {
  beforeEach(() => setActivePidWhitelist(null));

  it('parse đúng mã pending, KHÔNG lẫn với mã confirmed (mode 03)', async () => {
    expect(await readPendingDtcCodes()).toEqual([{ code: 'P0171', description: null }]);
  });

  it('NO DATA (xe không có mã pending nào) -> mảng rỗng', async () => {
    delete responses['07'];
    expect(await readPendingDtcCodes()).toEqual([]);
    responses['07'] = '470171';
  });
});

describe('Mode 0A - Permanent DTC', () => {
  it('parse đúng NHIỀU mã permanent', async () => {
    expect(await readPermanentDtcCodes()).toEqual([
      { code: 'P0171', description: null },
      { code: 'P0420', description: null },
    ]);
  });
});

describe('Mode 02 - Freeze Frame', () => {
  it('đọc đúng RPM/Speed/Coolant tại frame 0 (tái dùng PID_REGISTRY.decode)', async () => {
    const ff = await readFreezeFrame();
    expect(ff.rpm).toBe(1750);
    expect(ff.speedKmh).toBe(60);
    expect(ff.coolantTempC).toBe(82);
  });

  it('PID không hỗ trợ (whitelist chặn) -> field null, không gửi lệnh thừa', async () => {
    setActivePidWhitelist(['0C', '0D']); // không có 05/04/06/42
    const ff = await readFreezeFrame();
    expect(ff.rpm).toBe(1750);
    expect(ff.coolantTempC).toBeNull();
    expect(ff.engineLoadPct).toBeNull();
    setActivePidWhitelist(null);
  });
});
