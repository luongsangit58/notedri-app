/**
 * 5 PID (06 fuel trim, 0B áp suất khí nạp, 0F/46 nhiệt độ, 5E tốc độ tiêu hao
 * xăng) đã có decoder trong PID_REGISTRY từ lâu nhưng CHƯA từng được ĐỌC ở đâu
 * (không có reader function, không dùng cho snapshot nào) - phát hiện qua rà
 * soát 14/7 khi làm màn "Xem tất cả thông số kỹ thuật". Test hex tính tay,
 * khớp công thức trong obdParser.PID_REGISTRY.
 */
const responses: Record<string, string> = {
  '0106': '410690', // (0x90-128)*100/128 = 12.5%
  '010B': '410B4B', // 0x4B = 75 kPa
  '010F': '410F32', // 0x32-40 = 10°C
  '0146': '41463C', // 0x3C-40 = 20°C
  '015E': '415E0064', // (0*256+100)/20 = 5.0 L/h
};

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => Promise.resolve(responses[cmd] ?? 'NO DATA'),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  readFuelTrimShortB1,
  readIntakeManifoldPressure,
  readIntakeAirTemp,
  readAmbientAirTemp,
  readFuelRate,
  readExtendedSnapshot,
  setActivePidWhitelist,
} = require('../ObdReader');

describe('ObdReader - 5 PID mở rộng (màn Xem tất cả thông số kỹ thuật)', () => {
  beforeEach(() => setActivePidWhitelist(null));

  it('readFuelTrimShortB1: byte có dấu decode đúng', async () => {
    expect(await readFuelTrimShortB1()).toBe(12.5);
  });

  it('readIntakeManifoldPressure: raw byte = kPa', async () => {
    expect(await readIntakeManifoldPressure()).toBe(75);
  });

  it('readIntakeAirTemp: offset -40', async () => {
    expect(await readIntakeAirTemp()).toBe(10);
  });

  it('readAmbientAirTemp: offset -40', async () => {
    expect(await readAmbientAirTemp()).toBe(20);
  });

  it('readFuelRate: 2 byte / 20', async () => {
    expect(await readFuelRate()).toBe(5.0);
  });

  it('readExtendedSnapshot: gộp cả 5 giá trị', async () => {
    const ext = await readExtendedSnapshot();
    expect(ext).toMatchObject({
      fuelTrimShortB1Pct: 12.5,
      intakeManifoldPressureKpa: 75,
      intakeAirTempC: 10,
      ambientAirTempC: 20,
      fuelRateLPerHour: 5.0,
    });
  });

  it('capability whitelist chặn đúng: PID ngoài danh sách trả null, không gửi lệnh', async () => {
    setActivePidWhitelist(['0C', '0D']); // không có 06/0B/0F/46/5E
    expect(await readFuelTrimShortB1()).toBeNull();
    expect(await readFuelRate()).toBeNull();
  });
});
