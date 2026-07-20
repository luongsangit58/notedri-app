import { bleService } from './BleService';
import { createLogger } from './obdLogger';

const log = createLogger('scheduler');

/**
 * Polling Scheduler chung (mục 3 yêu cầu cải tiến): thay vì mọi PID cùng 1
 * nhịp, chia 3 tầng Fast/Medium/Slow, mỗi tầng có nhịp riêng và dễ đăng ký
 * thêm task mới (register 1 lần, không phải sửa vòng lặp trung tâm).
 *
 * Đây là module THUẦN (không phụ thuộc ObdReader/obdLiveMonitor cụ thể) -
 * obdLiveMonitor.ts đăng ký các task PID thật vào đây. VIN và Capability
 * KHÔNG nằm trong scheduler này (đã và vẫn đọc ngoài vòng poll, xem
 * capabilityService.ts).
 */

export type PollTier = 'fast' | 'medium' | 'slow';

export type PollTask = {
  id: string;
  tier: PollTier;
  /** Ghi đè nhịp mặc định của tầng (ms) - phần "dễ mở rộng" của scheduler. */
  intervalMs?: number;
  run: () => Promise<void>;
};

const DEFAULT_TIER_INTERVAL_MS: Record<PollTier, number> = {
  fast: 500,
  medium: 3000,
  slow: 45000,
};

// Độ phân giải tick nội bộ - đủ nhỏ để tầng fast (500ms) chạy đúng nhịp mà
// không tạo quá nhiều timer song song (mỗi task riêng 1 setInterval sẽ khó
// đảm bảo "không chồng lệnh BLE cùng lúc").
const TICK_MS = 250;

const tasks = new Map<string, PollTask>();
const lastRunAt = new Map<string, number>();
const inFlight = new Set<string>();

let tickTimer: ReturnType<typeof setInterval> | null = null;

function effectiveInterval(task: PollTask): number {
  return task.intervalMs ?? DEFAULT_TIER_INTERVAL_MS[task.tier];
}

async function runTask(task: PollTask): Promise<void> {
  if (inFlight.has(task.id)) return; // Task trước chưa xong - bỏ nhịp này, không chồng lệnh.
  inFlight.add(task.id);
  const startedAt = Date.now();
  try {
    await task.run();
  } catch (err) {
    log.error(`task "${task.id}" threw`, err);
  } finally {
    inFlight.delete(task.id);
    lastRunAt.set(task.id, Date.now());
    log.debug(`task "${task.id}" ran in ${Date.now() - startedAt}ms`);
  }
}

async function tick(): Promise<void> {
  if (!bleService.isConnected()) return;

  // Sóng kém: tầng fast tạm hoãn hẳn (dữ liệu "tức thời" không có giá trị nếu
  // link không ổn định), tầng medium/slow vẫn chạy như bình thường - cùng
  // tinh thần "skipBeat" đã dùng cho vòng poll medium trước đây.
  const linkPoor = bleService.getLinkQuality() === 'poor';

  const now = Date.now();
  for (const task of tasks.values()) {
    if (linkPoor && task.tier === 'fast') continue;
    const last = lastRunAt.get(task.id) ?? 0;
    if (now - last < effectiveInterval(task)) continue;
    if (inFlight.has(task.id)) continue;
    // Chạy tuần tự (await) trong cùng tick - 1 lệnh BLE tại 1 thời điểm, tránh
    // dồn nhiều round-trip chồng lấn dù BleService tự có commandQueue riêng.
    await runTask(task);
  }
}

export const obdPollingScheduler = {
  register(task: PollTask): void {
    tasks.set(task.id, task);
    log.debug(`registered task "${task.id}" (${task.tier}, ${effectiveInterval(task)}ms)`);
  },

  unregister(id: string): void {
    tasks.delete(id);
    lastRunAt.delete(id);
    inFlight.delete(id);
  },

  isRunning(): boolean {
    return tickTimer !== null;
  },

  start(): void {
    if (tickTimer) return;
    lastRunAt.clear();
    inFlight.clear();
    tickTimer = setInterval(() => void tick(), TICK_MS);
    log.info('scheduler started', [...tasks.keys()]);
  },

  stop(): void {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
    lastRunAt.clear();
    inFlight.clear();
  },

  /** Chỉ dùng cho test - chạy đúng 1 tick thủ công thay vì chờ setInterval thật. */
  __tickOnceForTest(): Promise<void> {
    return tick();
  },
};
