/**
 * Mode 04 (Xoá DTC/tắt đèn check engine) và Mode 01 PID 01 (Readiness status).
 */
const responses: Record<string, string> = {
  '04': '44', // ack thành công (echo mode 0x44)
  '0101': '410100000000', // MIL off, 0 DTC, spark ignition, không monitor nào supported
};

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string) => Promise.resolve(responses[cmd] ?? 'NO DATA'),
    addDisconnectListener: () => () => {},
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { clearDtcCodes, readReadinessStatus } = require('../ObdReader');

describe('Mode 04 - Clear DTC', () => {
  it('response OK ("44") -> true', async () => {
    responses['04'] = '44';
    expect(await clearDtcCodes()).toBe(true);
  });

  it('NO DATA -> false', async () => {
    responses['04'] = 'NO DATA';
    expect(await clearDtcCodes()).toBe(false);
  });

  it('ERROR -> false', async () => {
    responses['04'] = 'ERROR';
    expect(await clearDtcCodes()).toBe(false);
  });

  it('response rỗng/garbled (không có tín hiệu thành công thật) -> false, KHÔNG ngầm coi là thành công', async () => {
    responses['04'] = '';
    expect(await clearDtcCodes()).toBe(false);
    responses['04'] = 'SEARCHING...';
    expect(await clearDtcCodes()).toBe(false);
  });

  it('negative response "7F 04 <NRC>" (ECU từ chối lệnh) -> false', async () => {
    responses['04'] = '7F0422'; // NRC 0x22 = conditionsNotCorrect
    expect(await clearDtcCodes()).toBe(false);
  });

  it('response OK dạng "OK" (adapter khác) -> true', async () => {
    responses['04'] = 'OK';
    expect(await clearDtcCodes()).toBe(true);
  });
});

describe('Mode 01 PID 01 - Readiness status', () => {
  it('MIL off, 0 DTC -> parse đúng', async () => {
    responses['0101'] = '410100000000';
    const status = await readReadinessStatus();
    expect(status).not.toBeNull();
    expect(status.milOn).toBe(false);
    expect(status.dtcCount).toBe(0);
    expect(status.ignitionType).toBe('spark');
  });

  it('MIL on + 3 DTC (byte A = 0x83) -> parse đúng', async () => {
    responses['0101'] = '410183000000';
    const status = await readReadinessStatus();
    expect(status.milOn).toBe(true);
    expect(status.dtcCount).toBe(3);
  });

  it('NO DATA -> null', async () => {
    delete responses['0101'];
    expect(await readReadinessStatus()).toBeNull();
    responses['0101'] = '410100000000';
  });
});
