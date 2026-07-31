/**
 * 8 PID mở rộng (06 fuel trim ngắn hạn, 0B áp suất khí nạp, 0F/46 nhiệt độ,
 * 5E tốc độ tiêu hao xăng, 07 fuel trim dài hạn, 14 điện áp cảm biến oxy,
 * 33 áp suất khí quyển) - CHƯA từng được đọc trong live monitor 3s (round-trip
 * BLE không đáng để tốn cho dữ liệu ít dùng), chỉ dùng cho màn "Xem tất cả
 * thông số kỹ thuật". Test hex tính tay, khớp công thức trong obdParser.
 */
const responses: Record<string, string> = {
  '0106': '410690', // (0x90-128)*100/128 = 12.5%
  '010B': '410B4B', // 0x4B = 75 kPa
  '010F': '410F32', // 0x32-40 = 10°C
  '0146': '41463C', // 0x3C-40 = 20°C
  '015E': '415E0064', // (0*256+100)/20 = 5.0 L/h
  '0107': '410790', // long-term fuel trim B1, cùng công thức PID 06 = 12.5%
  '0114': '41146400', // O2 B1S1: 0x64/200 = 0.5V
  '0133': '413365', // barometric pressure: 0x65 = 101 kPa
};

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => Promise.resolve(responses[cmd] ?? 'NO DATA'),
    // ObdReader.ts import capabilityService.ts (cache VIN theo phiên, 15/7) -
    // đăng ký listener ở module scope khi import.
    addDisconnectListener: () => () => {},
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  readFuelTrimShortB1,
  readIntakeManifoldPressure,
  readIntakeAirTemp,
  readAmbientAirTemp,
  readFuelRate,
  readFuelTrimLongB1,
  readO2SensorB1S1Voltage,
  readBarometricPressure,
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

  it('readFuelTrimLongB1: cùng công thức PID 06', async () => {
    expect(await readFuelTrimLongB1()).toBe(12.5);
  });

  it('readO2SensorB1S1Voltage: byte / 200', async () => {
    expect(await readO2SensorB1S1Voltage()).toBe(0.5);
  });

  it('readBarometricPressure: raw byte = kPa', async () => {
    expect(await readBarometricPressure()).toBe(101);
  });

  it('readExtendedSnapshot: gộp đủ 8 giá trị', async () => {
    const ext = await readExtendedSnapshot();
    expect(ext).toMatchObject({
      fuelTrimShortB1Pct: 12.5,
      intakeManifoldPressureKpa: 75,
      intakeAirTempC: 10,
      ambientAirTempC: 20,
      fuelRateLPerHour: 5.0,
      fuelTrimLongB1Pct: 12.5,
      o2SensorB1S1Voltage: 0.5,
      barometricPressureKpa: 101,
    });
  });

  it('capability whitelist chặn đúng: PID ngoài danh sách trả null, không gửi lệnh', async () => {
    setActivePidWhitelist(['0C', '0D']); // không có 06/0B/0F/46/5E
    expect(await readFuelTrimShortB1()).toBeNull();
    expect(await readFuelRate()).toBeNull();
  });
});
