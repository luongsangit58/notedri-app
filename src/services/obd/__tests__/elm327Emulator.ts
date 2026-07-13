/**
 * Emulator ELM327: phát lại response THẬT đã ghi trong obd-fixtures/*.json để test
 * toàn luồng (init → poll → decode) không cần ra xe. Cùng một lệnh xuất hiện nhiều
 * lần trong fixture (vd 010C) được trả tuần tự rồi giữ ở response cuối - mô phỏng
 * đúng diễn biến phiên thật.
 */
export type FixtureEntry = { t: number; cmd: string; res: string };

export class Elm327Emulator {
  private queues = new Map<string, string[]>();
  /** Mọi lệnh đã nhận - assert hành vi (vd whitelist không được gửi 012F). */
  readonly received: string[] = [];

  constructor(entries: FixtureEntry[]) {
    for (const e of entries) {
      if (e.cmd.startsWith('#')) continue; // entry ghi chú (#device/#services/#char...)
      if (!this.queues.has(e.cmd)) this.queues.set(e.cmd, []);
      this.queues.get(e.cmd)!.push(e.res);
    }
  }

  async sendCommand(command: string, _timeoutMs?: number): Promise<string> {
    this.received.push(command);

    const queue = this.queues.get(command);
    if (queue && queue.length > 0) {
      // Tuần tự theo fixture; hết thì lặp lại response cuối
      return queue.length > 1 ? queue.shift()! : queue[0];
    }

    // Lệnh không có trong fixture: AT → OK, còn lại coi như xe không hỗ trợ
    return command.toUpperCase().startsWith('AT') ? 'OK' : 'NO DATA';
  }
}
