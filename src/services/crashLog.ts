import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_ERROR_KEY = 'last_fatal_error';

export type PersistedError = {
  message: string;
  stack?: string;
  isFatal: boolean;
  at: string;
};

/**
 * Rà soát crash 7/8 (phiên KW906 dừng đột ngột giữa lúc lái, log OBD sạch tới
 * mục cuối, không dấu vết lỗi nào): app không có ErrorBoundary/global handler/
 * crash reporter nào - bất kỳ exception JS nào không được bắt (kể cả từ 1
 * callback native BLE/Classic ngoài React tree) làm chết cả app ở bản release
 * mà không để lại gì để tra sau. Ghi lỗi cuối cùng xuống AsyncStorage TRƯỚC KHI
 * để lỗi tiếp tục lan truyền - không đổi hành vi crash mặc định của RN (dev vẫn
 * đỏ màn hình, release vẫn crash như cũ), chỉ thêm chỗ tra "lần trước app chết
 * vì gì" ở lần mở app sau.
 */
export function persistFatalError(error: unknown, isFatal: boolean): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  const payload: PersistedError = { message, stack, isFatal, at: new Date().toISOString() };
  AsyncStorage.setItem(LAST_ERROR_KEY, JSON.stringify(payload)).catch(() => {});
}

export async function readLastFatalError(): Promise<PersistedError | null> {
  const raw = await AsyncStorage.getItem(LAST_ERROR_KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedError;
  } catch {
    return null;
  }
}

// Bắt exception JS ném ra ngoài mọi try/catch (kể cả ngoài React tree, vd
// callback native) trước khi RN xử lý theo mặc định (dev: LogBox; release:
// crash) - gọi 1 lần, sớm nhất có thể (module scope của App.tsx), không phải
// trong useEffect vì crash có thể xảy ra trước khi component đầu tiên mount.
export function installGlobalErrorHandler(): void {
  const g = global as any;
  if (!g.ErrorUtils?.setGlobalHandler) return;
  const originalHandler = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((error: unknown, isFatal: boolean) => {
    persistFatalError(error, isFatal);
    originalHandler?.(error, isFatal);
  });
}
