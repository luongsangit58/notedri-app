/**
 * ATRV đọc điện áp trực tiếp từ chân 16 giắc OBD qua ADC của ELM327 - KHÔNG
 * qua ECU/protocol, nên vẫn đo được ngay cả khi mọi PID mode 01 đều
 * TIMEOUT/UNABLE TO CONNECT (case VF6, 2026-08-16).
 */
const responses: Record<string, string> = {
  ATRV: '12.6V',
};

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => Promise.resolve(responses[cmd] ?? 'NO DATA'),
    addDisconnectListener: () => () => {},
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readBatteryVoltageDirect } = require('../ObdReader');

describe('ObdReader - readBatteryVoltageDirect (ATRV)', () => {
  it('parse "12.6V" đúng thành 12.6', async () => {
    responses.ATRV = '12.6V';
    expect(await readBatteryVoltageDirect()).toBe(12.6);
  });

  it('parse response có rác kèm theo (echo/CR) vẫn ra đúng số', async () => {
    responses.ATRV = 'ATRV\r12.9V\r\r>';
    expect(await readBatteryVoltageDirect()).toBe(12.9);
  });

  it('response không có "V" (vd lỗi/rỗng) -> null, không throw', async () => {
    responses.ATRV = 'ERROR';
    expect(await readBatteryVoltageDirect()).toBeNull();
  });

  it('giá trị vô lý (>=30V, adapter lỗi) -> null', async () => {
    responses.ATRV = '99.9V';
    expect(await readBatteryVoltageDirect()).toBeNull();
  });
});
