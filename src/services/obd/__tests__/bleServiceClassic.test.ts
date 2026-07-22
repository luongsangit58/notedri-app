/**
 * Test transport Bluetooth Classic (SPP) trong BleService.ts (22/7) - dùng chung
 * command queue/session log/reconnect-grace với BLE, chỉ khác cách ghi/đọc byte
 * thô qua module native NotedriBtPairing. Mock module này với 1 event registry
 * giả để lái đúng các nhánh: kết nối, gửi lệnh, ngắt chủ động, mất kết nối bất
 * ngờ + tự hồi phục (reconnect grace).
 *
 * Factory của jest.mock() PHẢI tự chứa (không đóng lại biến ngoài scope) - jest
 * hoist toàn bộ lời gọi jest.mock() lên ĐẦU file, trước cả các "const" khai báo
 * phía trên nó trong source - tham chiếu 1 biến ngoài chưa kịp gán sẽ ra
 * undefined. Lấy lại đúng instance mock qua import bình thường SAU khi mock.
 */
type Listener = (event: any) => void;

jest.mock('../../../../modules/notedri-bt-pairing/src/NotedriBtPairingModule', () => {
  const listeners: Record<string, Listener[]> = {};
  const emit = (event: string, payload: any) => {
    (listeners[event] || []).slice().forEach((fn) => fn(payload));
  };
  const mock = {
    discoverDevices: jest.fn(),
    pairAndTestAtz: jest.fn(),
    connectClassic: jest.fn().mockResolvedValue(undefined),
    writeClassic: jest.fn().mockResolvedValue(undefined),
    disconnectClassic: jest.fn().mockImplementation(() => {
      // Native thật luôn phát onClassicDisconnected sau khi đóng socket (xem
      // NotedriBtPairingModule.kt) - mock lại đúng hành vi này để test disconnect()
      // đi qua đúng đường dọn dẹp DUY NHẤT (handleTransportDisconnected qua
      // event), không phải qua 1 nhánh tắt riêng trong disconnect().
      emit('onClassicDisconnected', { reason: 'intentional' });
      return Promise.resolve(undefined);
    }),
    addListener: (event: string, fn: Listener) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
      return { remove: () => { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); } };
    },
    __emit: emit,
  };
  return { __esModule: true, default: mock };
});

import { bleService } from '../BleService';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import mockPairingModule from '../../../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';

const mockPairing = mockPairingModule as unknown as {
  discoverDevices: jest.Mock;
  pairAndTestAtz: jest.Mock;
  connectClassic: jest.Mock;
  writeClassic: jest.Mock;
  disconnectClassic: jest.Mock;
  addListener: (event: string, fn: Listener) => { remove: () => void };
  __emit: (event: string, payload: any) => void;
};

function b64(s: string): string {
  return Buffer.from(s, 'binary').toString('base64');
}

function emit(event: string, payload: any) {
  mockPairing.__emit(event, payload);
}

describe('BleService - transport Bluetooth Classic', () => {
  beforeEach(async () => {
    // Dọn kết nối còn sống từ test TRƯỚC (nếu có) TRƯỚC KHI clearAllMocks() -
    // để lệnh disconnectClassic() gọi ở bước dọn dẹp này không lẫn vào số lần
    // gọi mà chính test hiện tại kiểm tra (đổi thứ tự sẽ đếm dư 1 lần).
    await bleService.disconnect().catch(() => {});
    jest.clearAllMocks();
    mockPairing.connectClassic.mockResolvedValue(undefined);
    mockPairing.writeClassic.mockResolvedValue(undefined);
  });

  it('connectClassic(): kết nối thành công thì isConnected/getDeviceId/getDeviceName đúng', async () => {
    await bleService.connectClassic('13:E0:2F:8D:48:3F', 'Android-Vlink', '1234');

    expect(mockPairing.connectClassic).toHaveBeenCalledWith('13:E0:2F:8D:48:3F', '1234');
    expect(bleService.isConnected()).toBe(true);
    expect(bleService.getDeviceId()).toBe('13:E0:2F:8D:48:3F');
    expect(bleService.getDeviceName()).toBe('Android-Vlink');
  });

  it('connectClassic(): gọi 2 lần chồng nhau -> lần 2 báo CONNECT_IN_PROGRESS, không phá phiên đầu', async () => {
    // Bước đầu cố tình treo connectClassic() native để mô phỏng "đang connecting"
    let resolveFirst: () => void = () => {};
    mockPairing.connectClassic.mockImplementationOnce(
      () => new Promise<void>((res) => { resolveFirst = res; })
    );
    const first = bleService.connectClassic('AA:BB', 'Vlink');

    await expect(bleService.connectClassic('CC:DD', 'Other')).rejects.toMatchObject({ code: 'CONNECT_IN_PROGRESS' });

    resolveFirst();
    await first;
    expect(bleService.isConnected()).toBe(true);
    expect(bleService.getDeviceId()).toBe('AA:BB');
  });

  it("sendCommand(): ghi qua writeClassic (base64) và resolve khi onClassicData có dấu '>'", async () => {
    await bleService.connectClassic('13:E0:2F:8D:48:3F', 'Android-Vlink');

    const promise = bleService.sendCommand('0100', 2000);
    await Promise.resolve(); // để microtask trong _sendCommandInternal chạy write trước

    expect(mockPairing.writeClassic).toHaveBeenCalledWith(b64('0100\r'));

    emit('onClassicData', { data: b64('41 00 BE 3F B8 11\r\r>') });
    const result = await promise;
    expect(result).toContain('41 00');
  });

  it('sendCommand(): dữ liệu chia nhiều đoạn (chunk) vẫn gộp đúng buffer trước khi resolve', async () => {
    await bleService.connectClassic('13:E0:2F:8D:48:3F', 'Android-Vlink');

    const promise = bleService.sendCommand('ATZ', 2000);
    await Promise.resolve();

    // Mô phỏng RFCOMM giao 512-byte chunk, response dài hơn 1 lần read()
    emit('onClassicData', { data: b64('ELM327') });
    emit('onClassicData', { data: b64(' v2.3\r\r') });
    emit('onClassicData', { data: b64('>') });

    const result = await promise;
    expect(result).toBe('ELM327 v2.3');
  });

  it('disconnect(): chủ động ngắt thì dọn state đúng 1 lần, KHÔNG tự reconnect', async () => {
    await bleService.connectClassic('13:E0:2F:8D:48:3F', 'Android-Vlink');
    const disconnectListener = jest.fn();
    const unsub = bleService.addDisconnectListener(disconnectListener);

    await bleService.disconnect();

    expect(mockPairing.disconnectClassic).toHaveBeenCalledTimes(1);
    expect(bleService.isConnected()).toBe(false);
    expect(disconnectListener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it('mất kết nối bất ngờ: vào reconnect grace rồi hồi phục khi connectClassic() thử lại thành công', async () => {
    jest.useFakeTimers();
    try {
      await bleService.connectClassic('13:E0:2F:8D:48:3F', 'Android-Vlink');

      const reconnecting = jest.fn();
      const reconnected = jest.fn();
      const disconnected = jest.fn();
      const unsubs = [
        bleService.addReconnectingListener(reconnecting),
        bleService.addReconnectedListener(reconnected),
        bleService.addDisconnectListener(disconnected),
      ];

      // Remote đóng kết nối KHÔNG qua disconnect() - phải là unexpected
      emit('onClassicDisconnected', { reason: 'EOF' });
      // handleTransportDisconnected chạy đồng bộ trong callback event -> attemptReconnect
      // bắt đầu vòng lặp await delay(...) đầu tiên (1000ms theo RECONNECT_DELAYS_MS).
      await jest.advanceTimersByTimeAsync(0);
      expect(reconnecting).toHaveBeenCalledWith(1);
      expect(bleService.isConnected()).toBe(false);

      await jest.advanceTimersByTimeAsync(1000);
      // connectClassic() (mock) resolve ngay -> reconnect thành công ở attempt 1
      expect(reconnected).toHaveBeenCalledTimes(1);
      expect(disconnected).not.toHaveBeenCalled();
      expect(bleService.isConnected()).toBe(true);

      unsubs.forEach((u) => u());
    } finally {
      jest.useRealTimers();
    }
  });

  it('mất kết nối bất ngờ: hết cả 3 lần thử -> báo disconnect hẳn, không còn kết nối', async () => {
    jest.useFakeTimers();
    try {
      await bleService.connectClassic('13:E0:2F:8D:48:3F', 'Android-Vlink');
      mockPairing.connectClassic.mockRejectedValue(new Error('vẫn ngoài tầm sóng'));

      const disconnected = jest.fn();
      const unsub = bleService.addDisconnectListener(disconnected);

      emit('onClassicDisconnected', { reason: 'EOF' });
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000); // attempt 1 (fail)
      await jest.advanceTimersByTimeAsync(3000); // attempt 2 (fail)
      await jest.advanceTimersByTimeAsync(6000); // attempt 3 (fail) -> give up

      expect(disconnected).toHaveBeenCalledTimes(1);
      expect(bleService.isConnected()).toBe(false);

      unsub();
    } finally {
      jest.useRealTimers();
      mockPairing.connectClassic.mockResolvedValue(undefined);
    }
  });
});
