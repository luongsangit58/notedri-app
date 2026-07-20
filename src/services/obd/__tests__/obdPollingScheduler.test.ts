/**
 * obdPollingScheduler (mục 3 yêu cầu cải tiến): tầng Fast/Medium/Slow chạy
 * đúng nhịp riêng, không chồng lệnh khi task trước chưa xong, và tầng fast
 * tạm hoãn khi sóng kém - cùng tinh thần "skipBeat" cũ của obdLiveMonitor.ts.
 */

let mockConnected = true;
let mockLinkQuality: 'good' | 'poor' = 'good';

jest.mock('../BleService', () => ({
  bleService: {
    isConnected: () => mockConnected,
    getLinkQuality: () => mockLinkQuality,
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { obdPollingScheduler } = require('../obdPollingScheduler');

describe('obdPollingScheduler', () => {
  beforeEach(() => {
    mockConnected = true;
    mockLinkQuality = 'good';
    jest.useFakeTimers();
  });

  afterEach(() => {
    obdPollingScheduler.stop();
    obdPollingScheduler.unregister('fast-task');
    obdPollingScheduler.unregister('medium-task');
    obdPollingScheduler.unregister('slow-task');
    jest.useRealTimers();
  });

  it('tầng fast (500ms) chạy nhiều lần hơn tầng slow (45s) trong cùng khoảng thời gian', async () => {
    let fastRuns = 0;
    let slowRuns = 0;
    obdPollingScheduler.register({ id: 'fast-task', tier: 'fast', run: async () => { fastRuns += 1; } });
    obdPollingScheduler.register({ id: 'slow-task', tier: 'slow', run: async () => { slowRuns += 1; } });
    obdPollingScheduler.start();

    await jest.advanceTimersByTimeAsync(5000);

    // Lần đầu mỗi task chạy NGAY (không đợi hết 1 nhịp) - không đợi tới tận 45s
    // mới có số liệu nhiên liệu/nhiệt độ dầu đầu tiên - nên slowRuns = 1 (chỉ
    // lần đầu), fastRuns chạy lặp lại nhiều lần trong cùng 5s.
    expect(fastRuns).toBeGreaterThan(slowRuns);
    expect(fastRuns).toBeGreaterThanOrEqual(8); // ~5000/500
    expect(slowRuns).toBe(1); // đúng 1 lần đầu, chưa tới nhịp 45s tiếp theo
  });

  it('không chồng lệnh: task chạy chậm hơn nhịp của nó không bị gọi đè lần 2', async () => {
    let runs = 0;
    const pending: { resolve: (() => void) | undefined } = { resolve: undefined };
    obdPollingScheduler.register({
      id: 'medium-task',
      tier: 'medium',
      intervalMs: 500,
      run: () => new Promise<void>((resolve) => {
        runs += 1;
        pending.resolve = () => resolve();
      }),
    });
    obdPollingScheduler.start();

    // Task đầu bắt đầu chạy (chưa resolve) - nhiều tick trôi qua trong lúc nó "đang chạy"
    await jest.advanceTimersByTimeAsync(2000);
    expect(runs).toBe(1); // vẫn đang inFlight, không gọi chồng lần 2

    pending.resolve?.();
    await jest.advanceTimersByTimeAsync(600); // đủ 1 nhịp nữa sau khi xong
    expect(runs).toBe(2);
  });

  it('sóng kém (poor): tầng fast tạm hoãn, tầng medium vẫn chạy bình thường', async () => {
    let fastRuns = 0;
    let mediumRuns = 0;
    mockLinkQuality = 'poor';
    obdPollingScheduler.register({ id: 'fast-task', tier: 'fast', run: async () => { fastRuns += 1; } });
    obdPollingScheduler.register({ id: 'medium-task', tier: 'medium', intervalMs: 1000, run: async () => { mediumRuns += 1; } });
    obdPollingScheduler.start();

    await jest.advanceTimersByTimeAsync(3000);

    expect(fastRuns).toBe(0);
    expect(mediumRuns).toBeGreaterThan(0);
  });

  it('không chạy khi BLE mất kết nối', async () => {
    let runs = 0;
    mockConnected = false;
    obdPollingScheduler.register({ id: 'medium-task', tier: 'medium', intervalMs: 500, run: async () => { runs += 1; } });
    obdPollingScheduler.start();

    await jest.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(0);
  });

  it('stop() dừng hẳn - không còn task nào chạy sau đó', async () => {
    let runs = 0;
    obdPollingScheduler.register({ id: 'medium-task', tier: 'medium', intervalMs: 500, run: async () => { runs += 1; } });
    obdPollingScheduler.start();
    await jest.advanceTimersByTimeAsync(1000);
    const before = runs;
    obdPollingScheduler.stop();
    await jest.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(before);
  });

  it('task throw lỗi không làm sập scheduler - task khác vẫn chạy tiếp', async () => {
    let goodRuns = 0;
    obdPollingScheduler.register({ id: 'medium-task', tier: 'medium', intervalMs: 500, run: async () => { throw new Error('boom'); } });
    obdPollingScheduler.register({ id: 'slow-task', tier: 'fast', run: async () => { goodRuns += 1; } });
    obdPollingScheduler.start();

    await jest.advanceTimersByTimeAsync(2000);
    expect(goodRuns).toBeGreaterThan(0);
  });
});
