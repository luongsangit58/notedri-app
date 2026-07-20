/**
 * Logger nhóm theo module OBD-II (mục 9 yêu cầu cải tiến): BLE/ELM/PID/
 * Scheduler/DTC/Knowledge/Performance KHÔNG log lẫn nhau, mỗi nhóm bật/tắt
 * độc lập. Trước giờ module OBD không có logger có cấu trúc nào (chỉ có
 * BleService.sessionLog - phục vụ export fixture, không phải quan sát vận
 * hành) nên đây là bổ sung thuần tuý, không thay hành vi bất kỳ module nào.
 */

export type LogGroup = 'ble' | 'elm' | 'pid' | 'scheduler' | 'dtc' | 'knowledge' | 'performance';

const ALL_GROUPS: LogGroup[] = ['ble', 'elm', 'pid', 'scheduler', 'dtc', 'knowledge', 'performance'];

// Mặc định: bật ở dev, tắt ở production build (tránh console noise/leak dữ
// liệu xe thật trong bản release). __DEV__ là global có sẵn của React Native.
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

const enabled: Record<LogGroup, boolean> = ALL_GROUPS.reduce((acc, g) => {
  acc[g] = isDev;
  return acc;
}, {} as Record<LogGroup, boolean>);

export function setLogGroupEnabled(group: LogGroup, on: boolean): void {
  enabled[group] = on;
}

export function isLogGroupEnabled(group: LogGroup): boolean {
  return enabled[group];
}

export function setAllLogGroupsEnabled(on: boolean): void {
  ALL_GROUPS.forEach((g) => { enabled[g] = on; });
}

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

/** Tạo logger gắn nhãn nhóm cố định - console.* chỉ chạy khi nhóm đang bật. */
export function createLogger(group: LogGroup): Logger {
  const prefix = `[obd:${group}]`;
  return {
    debug: (...args) => { if (enabled[group]) console.debug(prefix, ...args); },
    info: (...args) => { if (enabled[group]) console.info(prefix, ...args); },
    warn: (...args) => { if (enabled[group]) console.warn(prefix, ...args); },
    // Lỗi luôn log (kể cả nhóm đang tắt) - lỗi thật không nên bị nuốt im lặng.
    error: (...args) => { console.error(prefix, ...args); },
  };
}
