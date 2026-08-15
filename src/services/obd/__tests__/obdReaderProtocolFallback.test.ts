/**
 * Mô phỏng đúng kịch bản log thực tế của xe VF6 (báo cáo 2026-08-15): ATSP0
 * (auto-detect) init OK nhưng mọi PID mode 01 đều TIMEOUT/UNABLE TO CONNECT,
 * y hệt log KONNWEI KW906 trên xe đó. Test này KHÔNG chứng minh được VF6 thật
 * sẽ phản hồi dưới protocol CAN ép cụ thể nào - không ai biết được điều đó nếu
 * không cắm vào xe thật. Test chỉ xác nhận LOGIC fallback trong ObdReader.ts
 * hoạt động đúng: dò lần lượt, dừng ngay khi có data, và dọn dẹp sạch khi
 * không protocol nào ăn - tách bạch "code chạy đúng" khỏi "xe có hỗ trợ hay
 * không" (câu hỏi thứ 2 chỉ trả lời được bằng cách test trên xe thật).
 */
let currentProtocol = 'auto';
// PID chỉ có data khi đang ở protocol RESPONSIVE_PROTOCOL - mô phỏng 1 xe giả
// định "chỉ nói CAN 29-bit 500k (ATSP7)" mà auto-detect bỏ sót.
const RESPONSIVE_PROTOCOL = '7';

const mockSendCommand = jest.fn((cmd: string): Promise<string> => {
  const setProtocol = /^ATSP(\w)$/.exec(cmd);
  if (setProtocol) {
    currentProtocol = setProtocol[1];
    return Promise.resolve('OK');
  }
  if (cmd.toUpperCase().startsWith('AT')) return Promise.resolve('OK');

  if (cmd === '010C' || cmd === '010D') {
    if (currentProtocol === RESPONSIVE_PROTOCOL) {
      return Promise.resolve(cmd === '010C' ? '410C1AF8' : '410D3C');
    }
    return Promise.resolve('UNABLE TO CONNECT');
  }
  return Promise.resolve('NO DATA');
});

jest.mock('../BleService', () => ({
  bleService: {
    sendCommand: (cmd: string, timeoutMs?: number) => mockSendCommand(cmd, timeoutMs),
    addDisconnectListener: () => () => {},
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initializeElm327 } = require('../ObdReader');

describe('ObdReader - fallback ép protocol CAN khi ATSP0 auto-detect thất bại', () => {
  beforeEach(() => {
    currentProtocol = 'auto';
    mockSendCommand.mockClear();
  });

  it('xe chỉ phản hồi ở 1 protocol CAN cụ thể (ATSP7): auto-detect fail, fallback tìm ra và dùng luôn', async () => {
    const result = await initializeElm327();

    expect(result).toMatchObject({ ok: true, dataAvailable: true });

    const calls = mockSendCommand.mock.calls.map((c) => c[0]);
    // Dò tuần tự 6 trước 7, dừng ngay khi 7 ra data - KHÔNG được gọi tới 8/9
    // (tốn thêm round-trip vô ích nếu đã tìm ra protocol đúng).
    expect(calls).toContain('ATSP6');
    expect(calls).toContain('ATSP7');
    expect(calls).not.toContain('ATSP8');
    expect(calls).not.toContain('ATSP9');
  });

  it('không protocol CAN nào ép được: vẫn báo dataAvailable=false như cũ, KHÔNG hang, và trả adapter về auto', async () => {
    currentProtocol = 'auto';
    // Không xe nào phản hồi ở bất kỳ protocol nào (mô phỏng bus thực sự im lặng).
    const alwaysSilent = mockSendCommand.mockImplementation((cmd: string) => {
      if (cmd.toUpperCase().startsWith('AT')) return Promise.resolve('OK');
      return Promise.resolve('UNABLE TO CONNECT');
    });

    const result = await initializeElm327();

    expect(result.ok).toBe(true);
    expect(result.dataAvailable).toBe(false);
    if (!result.dataAvailable) {
      expect(result.rawRpmResponse).toBe('UNABLE TO CONNECT');
    }

    const calls = alwaysSilent.mock.calls.map((c) => c[0]);
    expect(calls).toEqual(expect.arrayContaining(['ATSP6', 'ATSP7', 'ATSP8', 'ATSP9']));
    // Lệnh ATSP0 cuối cùng trong toàn bộ phiên phải là bước reset về auto sau khi
    // fallback thất bại (không được kẹt lại ở 1 protocol ép dở dang).
    const lastAtsp = [...calls].reverse().find((c) => /^ATSP/.test(c));
    expect(lastAtsp).toBe('ATSP0');
  });

  it('xe hoạt động bình thường (auto-detect ra data ngay): không gọi bất kỳ ATSPx fallback nào', async () => {
    currentProtocol = RESPONSIVE_PROTOCOL;
    // Auto-detect "tình cờ" đã chọn đúng protocol có data ngay từ ATSP0 - mô
    // phỏng xe đang hoạt động tốt hôm nay, không được hồi quy hiệu năng.
    mockSendCommand.mockImplementation((cmd: string) => {
      if (cmd === 'ATSP0') return Promise.resolve('OK');
      if (cmd.toUpperCase().startsWith('AT')) return Promise.resolve('OK');
      if (cmd === '010C') return Promise.resolve('410C1AF8');
      if (cmd === '010D') return Promise.resolve('410D3C');
      return Promise.resolve('NO DATA');
    });

    const result = await initializeElm327();

    expect(result).toMatchObject({ ok: true, dataAvailable: true });
    const calls = mockSendCommand.mock.calls.map((c) => c[0]);
    expect(calls.some((c) => /^ATSP[6-9]$/.test(c))).toBe(false);
  });
});
