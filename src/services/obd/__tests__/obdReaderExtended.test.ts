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
  // 14 PID mở rộng thêm (18/8, đối chiếu bảng chuẩn SAE J1979 công khai)
  '010E': '410E90', // (0x90/2)-64 = 8° trước TDC
  '0110': '411000C8', // (0*256+200)/100 = 2.00 g/s
  '0115': '41156400', // O2 Sensor 2: 0x64/200 = 0.5V
  '011C': '411C06', // enum OBD standard = 6
  '011F': '411F09FA', // 9*256+250 = 2554s
  '0121': '4121000F', // 0*256+15 = 15km
  '0122': '41220064', // 0.079*(0*256+100) = 7.9 kPa
  '0123': '41230506', // 10*(5*256+6) = 12860 kPa
  '012C': '412CFF', // 255*100/255 = 100%
  '012E': '412E85', // 0x85(133)*100/255 = 52.16% -> làm tròn nguyên = 52%
  '013C': '413C1432', // (20*256+50)/10-40 = 477°C
  '0143': '4143003D', // (100/255)*(0*256+61) = 23.9%
  '0144': '41447FE0', // (2/65536)*(127*256+224) = 0.999
  '0145': '414505', // 5*100/255 = 2.0% (làm tròn)
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
  readTimingAdvance,
  readMafAirFlowRate,
  readO2SensorB2Voltage,
  readObdStandard,
  readTimeSinceEngineStart,
  readDistanceWithMilOn,
  readFuelRailPressure,
  readFuelRailGaugePressure,
  readCommandedEgr,
  readCommandedEvapPurge,
  readCatalystTempB1S1,
  readAbsoluteLoadValue,
  readCommandedAirFuelRatio,
  readRelativeThrottlePosition,
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

  it('readTimingAdvance: (A/2)-64', async () => {
    expect(await readTimingAdvance()).toBe(8);
  });

  it('readMafAirFlowRate: (256A+B)/100', async () => {
    expect(await readMafAirFlowRate()).toBe(2.0);
  });

  it('readO2SensorB2Voltage: cùng công thức O2 Sensor 1', async () => {
    expect(await readO2SensorB2Voltage()).toBe(0.5);
  });

  it('readObdStandard: enum thô, không công thức', async () => {
    expect(await readObdStandard()).toBe(6);
  });

  it('readTimeSinceEngineStart: 256A+B giây', async () => {
    expect(await readTimeSinceEngineStart()).toBe(2554);
  });

  it('readDistanceWithMilOn: 256A+B km', async () => {
    expect(await readDistanceWithMilOn()).toBe(15);
  });

  it('readFuelRailPressure: 0.079*(256A+B)', async () => {
    expect(await readFuelRailPressure()).toBe(7.9);
  });

  it('readFuelRailGaugePressure: 10*(256A+B)', async () => {
    expect(await readFuelRailGaugePressure()).toBe(12860);
  });

  it('readCommandedEgr: A*100/255', async () => {
    expect(await readCommandedEgr()).toBe(100);
  });

  it('readCommandedEvapPurge: A*100/255 (làm tròn số nguyên, cùng kiểu PID 11/2C)', async () => {
    expect(await readCommandedEvapPurge()).toBe(52);
  });

  it('readCatalystTempB1S1: (256A+B)/10-40', async () => {
    expect(await readCatalystTempB1S1()).toBe(477);
  });

  it('readAbsoluteLoadValue: (100/255)*(256A+B)', async () => {
    expect(await readAbsoluteLoadValue()).toBe(23.9);
  });

  it('readCommandedAirFuelRatio: (2/65536)*(256A+B)', async () => {
    expect(await readCommandedAirFuelRatio()).toBe(0.999);
  });

  it('readRelativeThrottlePosition: A*100/255', async () => {
    expect(await readRelativeThrottlePosition()).toBe(2.0);
  });

  it('readExtendedSnapshot: gộp đủ 22 giá trị', async () => {
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
      timingAdvanceDeg: 8,
      mafAirFlowRateGPerS: 2.0,
      o2SensorB2Voltage: 0.5,
      obdStandard: 6,
      timeSinceEngineStartS: 2554,
      distanceWithMilOnKm: 15,
      fuelRailPressureKpa: 7.9,
      fuelRailGaugePressureKpa: 12860,
      commandedEgrPct: 100,
      commandedEvapPurgePct: 52,
      catalystTempB1S1C: 477,
      absoluteLoadValuePct: 23.9,
      commandedAirFuelRatio: 0.999,
      relativeThrottlePositionPct: 2.0,
    });
  });

  it('capability whitelist chặn đúng: PID ngoài danh sách trả null, không gửi lệnh', async () => {
    setActivePidWhitelist(['0C', '0D']); // không có 06/0B/0F/46/5E
    expect(await readFuelTrimShortB1()).toBeNull();
    expect(await readFuelRate()).toBeNull();
  });
});
