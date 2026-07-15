/**
 * Test tích hợp luồng OBD (init → snapshot) chạy trên emulator phát lại fixture THẬT
 * obd-fixtures/vgate-honda-city-20260713-02.json - "ra xe trong jest".
 * Bắt được đúng lớp bug đã dính hôm 13/7: parser không đọc nổi response thật
 * dù từng dòng code đều "hợp lý" khi nhìn riêng lẻ.
 */
import { Elm327Emulator, FixtureEntry } from './elm327Emulator';
import fixture from '../../../../obd-fixtures/vgate-honda-city-20260713-02.json';

// ObdReader chỉ dùng bleService.sendCommand - thay bằng emulator
// (prefix "mock" bắt buộc để jest.mock được phép tham chiếu biến ngoài scope)
const mockEmulator = new Elm327Emulator(fixture.entries as FixtureEntry[]);
jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string, timeoutMs?: number) => mockEmulator.sendCommand(cmd, timeoutMs),
    // ObdReader.ts import capabilityService.ts (cache VIN theo phiên, 15/7) -
    // đăng ký listener ở module scope khi import.
    addDisconnectListener: () => () => {},
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initializeElm327, readSnapshot, setActivePidWhitelist } = require('../ObdReader');

describe('Luồng OBD trên fixture Honda City (Vgate iCar Pro, ELM327 v2.3)', () => {
  beforeEach(() => setActivePidWhitelist(null));

  it('initializeElm327: nhận diện xe ĐANG trả dữ liệu (hồi quy: trước đây false vì parser hỏng)', async () => {
    const result = await initializeElm327();
    expect(result.ok).toBe(true);
    expect(result.dataAvailable).toBe(true);
  });

  it('readSnapshot: decode đúng giá trị thật của xe', async () => {
    const snap = await readSnapshot();

    // Giá trị nguyên văn từ fixture: máy nổ garanti, xe đỗ, đang ấm dần
    expect(snap.rpm).not.toBeNull();
    expect(snap.rpm).toBeGreaterThan(1000);
    expect(snap.rpm).toBeLessThan(1100);
    expect(snap.speedKmh).toBe(0);
    expect(snap.engineLoadPct).toBeGreaterThanOrEqual(40);
    expect(snap.engineLoadPct).toBeLessThanOrEqual(42);
    expect(snap.coolantTempC).toBeGreaterThanOrEqual(55);
    expect(snap.coolantTempC).toBeLessThanOrEqual(56);
    expect(snap.throttlePct).toBe(16);

    // Honda City không hỗ trợ 2 PID này (NO DATA trong fixture)
    expect(snap.fuelLevelPct).toBeNull();
    expect(snap.oilTempC).toBeNull();
  });

  it('capability whitelist: PID ngoài danh sách KHÔNG được gửi xuống adapter', async () => {
    setActivePidWhitelist(['0C', '0D', '04', '05', '11']); // không có 2F/5C

    const before = mockEmulator.received.length;
    const snap = await readSnapshot();
    const sent = mockEmulator.received.slice(before);

    expect(sent).not.toContain('012F');
    expect(sent).not.toContain('015C');
    expect(snap.fuelLevelPct).toBeNull();
    expect(snap.oilTempC).toBeNull();
    // PID trong whitelist vẫn đọc bình thường
    expect(sent).toContain('010C');
    expect(snap.rpm).not.toBeNull();
  });
});
