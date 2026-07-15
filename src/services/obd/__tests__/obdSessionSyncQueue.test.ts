/**
 * Hàng đợi phiên OBD (E2): phiên không được mất khi offline, không upload trùng
 * khi retry (idempotency_key giữ nguyên), không rò rỉ chéo tài khoản khi logout.
 */
const mockReportSession = jest.fn();

jest.mock('../../../api/obd', () => ({
  obdApi: {
    reportSession: (payload: unknown) => mockReportSession(payload),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

function freshModule() {
  jest.resetModules();
  return require('../ObdSessionSyncQueue');
}

const payload = (n = 1) => ({
  vehicle_id: n,
  device_name: 'IOS-Vlink',
  connected_at: '2026-07-15T08:00:00.000Z',
  duration_seconds: 1800,
  summary: { samples: 100, dtc_count: 0, findings: [] },
});

describe('ObdSessionSyncQueue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockReportSession.mockReset();
  });

  it('enqueue sinh idempotency_key (<64 ký tự) và giữ NGUYÊN key đó qua retry', async () => {
    const q = freshModule();
    await q.enqueueObdSession(payload());

    // Lần 1: mạng lỗi (không response.status) -> item giữ lại
    mockReportSession.mockRejectedValueOnce(new Error('Network Error'));
    await q.flushPendingObdSessions();
    const key1 = mockReportSession.mock.calls[0][0].idempotency_key;
    expect(typeof key1).toBe('string');
    expect(key1.length).toBeGreaterThan(0);
    expect(key1.length).toBeLessThan(64);

    // Lần 2: thành công - PHẢI gửi lại đúng key cũ (server chống trùng theo key)
    mockReportSession.mockResolvedValueOnce({});
    const res = await q.flushPendingObdSessions();
    expect(res.synced).toBe(1);
    expect(mockReportSession.mock.calls[1][0].idempotency_key).toBe(key1);

    // Payload gửi đi không lẫn field nội bộ của hàng đợi
    expect(mockReportSession.mock.calls[1][0]).not.toHaveProperty('retries');
    expect(mockReportSession.mock.calls[1][0]).not.toHaveProperty('queuedAt');
  });

  it('flush thành công -> hàng đợi rỗng, không gửi lại lần sau', async () => {
    const q = freshModule();
    await q.enqueueObdSession(payload());
    mockReportSession.mockResolvedValue({});

    await q.flushPendingObdSessions();
    expect(await q.pendingObdSessionCount()).toBe(0);

    await q.flushPendingObdSessions();
    expect(mockReportSession).toHaveBeenCalledTimes(1);
  });

  it('lỗi vĩnh viễn (422) -> bỏ item, không retry vô hạn', async () => {
    const q = freshModule();
    await q.enqueueObdSession(payload());
    mockReportSession.mockRejectedValue({ response: { status: 422 } });

    await q.flushPendingObdSessions();
    expect(await q.pendingObdSessionCount()).toBe(0);
  });

  it('lỗi tạm thời (500) -> giữ item chờ lần flush sau', async () => {
    const q = freshModule();
    await q.enqueueObdSession(payload());
    mockReportSession.mockRejectedValue({ response: { status: 500 } });

    await q.flushPendingObdSessions();
    expect(await q.pendingObdSessionCount()).toBe(1);
  });

  it('cap 30 item: enqueue thứ 31 đẩy item cũ nhất ra', async () => {
    const q = freshModule();
    for (let i = 1; i <= 31; i++) await q.enqueueObdSession(payload(i));
    expect(await q.pendingObdSessionCount()).toBe(30);

    mockReportSession.mockResolvedValue({});
    await q.flushPendingObdSessions();
    // Item vehicle_id=1 (cũ nhất) đã bị đẩy ra - lô gửi bắt đầu từ 2
    expect(mockReportSession.mock.calls[0][0].vehicle_id).toBe(2);
  });

  it('clearObdSessionQueue giữa flush -> item lỗi KHÔNG hồi sinh (chống rò rỉ chéo tài khoản)', async () => {
    const q = freshModule();
    await q.enqueueObdSession(payload());
    // Trong lúc "gửi", logout xen vào: clear queue rồi mới reject
    mockReportSession.mockImplementation(async () => {
      await q.clearObdSessionQueue();
      throw { response: { status: 500 } };
    });

    await q.flushPendingObdSessions();
    expect(await q.pendingObdSessionCount()).toBe(0);
  });
});
