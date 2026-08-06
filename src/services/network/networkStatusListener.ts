import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { flushObdQueuesAndRefreshCount, refreshPendingSyncCount } from '../obd/obdSyncStatus';
import { flushPendingGpsTrips } from '../gps/GpsTripSyncQueue';
import { useNetworkStatusStore } from '../../store/networkStatusStore';

/**
 * Chủ động flush mọi hàng đợi offline ngay khi mạng vừa có lại - trước đây cố
 * tình bỏ NetInfo/expo-network để khỏi rebuild native (xem comment ở
 * client.ts), chỉ dựa vào sự kiện tình cờ (BLE reconnect, mở màn hình, request
 * khác thành công). Đây là lớp phòng thủ BỔ SUNG, không thay thế các lớp đó -
 * nếu app rảnh/nền lâu không có sự kiện nào khác, mạng có lại vẫn tự đẩy.
 *
 * Rà soát 6/8 (user báo: mất mạng/có mạng lại không có thông báo gì cho user
 * biết) - ghi luôn trạng thái vào networkStatusStore mỗi lần đổi (kể cả lần
 * đọc đầu tiên lúc khởi động) để NetworkStatusToast.tsx hiện toast đúng lúc
 * chuyển, độc lập với việc flush hàng đợi ở đây.
 */

let started = false;
let wasOffline = false;

function flushAllQueues(): void {
  flushObdQueuesAndRefreshCount().catch(() => {});
  flushPendingGpsTrips().catch(() => {});
}

export function startNetworkStatusListener(): void {
  if (started) return;
  started = true;

  // Badge (obdSessionStore.pendingSyncCount) phải đúng ngay cả khi offline -
  // chỉ đọc AsyncStorage, không cần mạng - không đợi tới lần chuyển trạng thái
  // mạng đầu tiên mới biết có hàng đợi tồn từ phiên trước (app bị kill lúc offline).
  refreshPendingSyncCount().catch(() => {});

  getNetworkStateAsync()
    .then(({ isConnected, isInternetReachable }) => {
      const online = isConnected && isInternetReachable !== false;
      wasOffline = !online;
      useNetworkStatusStore.getState().patch({ isOnline: online });
      // App mở lại đã ONLINE sẵn nhưng còn hàng đợi sót từ phiên trước - bắt
      // kịp ngay, không chờ đủ 1 chu kỳ mất-có mạng mới của listener bên dưới.
      if (online) flushAllQueues();
    })
    .catch(() => {});

  addNetworkStateListener(({ isConnected, isInternetReachable }) => {
    const online = isConnected && isInternetReachable !== false;
    useNetworkStatusStore.getState().patch({ isOnline: online });
    if (online && wasOffline) flushAllQueues();
    wasOffline = !online;
  });
}
