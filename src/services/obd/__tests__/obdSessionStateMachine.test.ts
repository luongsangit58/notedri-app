/**
 * obdSessionStateMachine (mục 4 yêu cầu cải tiến): đúng chuỗi
 * DISCONNECTED -> CONNECTING -> CONNECTED -> ELM_READY ->
 * {ENGINE_OFF <-> ENGINE_IDLE <-> DRIVING} -> STOPPED -> DISCONNECTED,
 * cạnh không hợp lệ bị bỏ qua (không throw, không đổi state).
 */
import { obdSessionStateMachine } from '../obdSessionStateMachine';

describe('obdSessionStateMachine', () => {
  beforeEach(() => {
    obdSessionStateMachine.reset();
  });

  it('bắt đầu ở DISCONNECTED', () => {
    expect(obdSessionStateMachine.getState()).toBe('DISCONNECTED');
  });

  it('đi đúng chuỗi tới ELM_READY', () => {
    obdSessionStateMachine.setConnecting();
    expect(obdSessionStateMachine.getState()).toBe('CONNECTING');
    obdSessionStateMachine.setConnected();
    expect(obdSessionStateMachine.getState()).toBe('CONNECTED');
    obdSessionStateMachine.setElmReady();
    expect(obdSessionStateMachine.getState()).toBe('ELM_READY');
  });

  it('qua lại tự do giữa ENGINE_OFF/ENGINE_IDLE/DRIVING (xe tắt/nổ/chạy nhiều lần 1 phiên)', () => {
    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setConnected();
    obdSessionStateMachine.setElmReady();

    obdSessionStateMachine.setEngineIdle();
    expect(obdSessionStateMachine.getState()).toBe('ENGINE_IDLE');
    obdSessionStateMachine.setDriving();
    expect(obdSessionStateMachine.getState()).toBe('DRIVING');
    obdSessionStateMachine.setEngineIdle();
    expect(obdSessionStateMachine.getState()).toBe('ENGINE_IDLE');
    obdSessionStateMachine.setEngineOff();
    expect(obdSessionStateMachine.getState()).toBe('ENGINE_OFF');
    obdSessionStateMachine.setDriving();
    expect(obdSessionStateMachine.getState()).toBe('DRIVING');
  });

  it('kết thúc phiên: STOPPED rồi DISCONNECTED', () => {
    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setConnected();
    obdSessionStateMachine.setElmReady();
    obdSessionStateMachine.setDriving();

    obdSessionStateMachine.setStopped();
    expect(obdSessionStateMachine.getState()).toBe('STOPPED');
    obdSessionStateMachine.setDisconnected();
    expect(obdSessionStateMachine.getState()).toBe('DISCONNECTED');
  });

  it('cạnh không hợp lệ bị bỏ qua, không throw, state không đổi', () => {
    expect(() => obdSessionStateMachine.setDriving()).not.toThrow(); // DISCONNECTED -> DRIVING không hợp lệ
    expect(obdSessionStateMachine.getState()).toBe('DISCONNECTED');

    obdSessionStateMachine.setConnecting();
    expect(() => obdSessionStateMachine.setElmReady()).not.toThrow(); // CONNECTING -> ELM_READY không hợp lệ (thiếu CONNECTED)
    expect(obdSessionStateMachine.getState()).toBe('CONNECTING');
  });

  it('từ bất kỳ trạng thái nào cũng có thể về DISCONNECTED (rớt BLE giữa chừng)', () => {
    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setDisconnected();
    expect(obdSessionStateMachine.getState()).toBe('DISCONNECTED');
  });

  it('subscribe() nhận đúng state mới, unsubscribe xong không nhận nữa', () => {
    const seen: string[] = [];
    const unsub = obdSessionStateMachine.subscribe((s) => seen.push(s));

    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setConnected();
    unsub();
    obdSessionStateMachine.setElmReady();

    expect(seen).toEqual(['CONNECTING', 'CONNECTED']);
  });

  it('getHistory() ghi lại đúng thứ tự transition hợp lệ, bỏ qua cạnh không hợp lệ', () => {
    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setDriving(); // không hợp lệ từ CONNECTING - không được ghi
    obdSessionStateMachine.setConnected();

    const states = obdSessionStateMachine.getHistory().map((h) => h.state);
    expect(states).toEqual(['CONNECTING', 'CONNECTED']);
  });

  it('clearHistory() xoá lịch sử nhưng giữ nguyên state hiện tại', () => {
    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setConnected();
    obdSessionStateMachine.clearHistory();

    expect(obdSessionStateMachine.getHistory()).toEqual([]);
    expect(obdSessionStateMachine.getState()).toBe('CONNECTED');
  });

  it('gọi setter trùng state hiện tại là no-op, không thêm vào history', () => {
    obdSessionStateMachine.setConnecting();
    obdSessionStateMachine.setConnecting();
    expect(obdSessionStateMachine.getHistory().length).toBe(1);
  });
});
