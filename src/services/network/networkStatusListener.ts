import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { flushObdQueuesAndRefreshCount, refreshPendingSyncCount } from '../obd/obdSyncStatus';
import { flushPendingGpsTrips } from '../gps/GpsTripSyncQueue';

/**
 * Chủ động flush mọi hàng đợi offline ngay khi mạng vừa có lại - trước đây cố
 * tình bỏ NetInfo/expo-network để khỏi rebuild native (xem comment ở
 * client.ts), chỉ dựa vào sự kiện tình cờ (BLE reconnect, mở màn hình, request
 * khác thành công). Đây là lớp phòng thủ BỔ SUNG, không thay thế các lớp đó -
 * nếu app rảnh/nền lâu không có sự kiện nào khác, mạng có lại vẫn tự đẩy.
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
      // App mở lại đã ONLINE sẵn nhưng còn hàng đợi sót từ phiên trước - bắt
      // kịp ngay, không chờ đủ 1 chu kỳ mất-có mạng mới của listener bên dưới.
      if (online) flushAllQueues();
    })
    .catch(() => {});

  addNetworkStateListener(({ isConnected, isInternetReachable }) => {
    const online = isConnected && isInternetReachable !== false;
    if (online && wasOffline) flushAllQueues();
    wasOffline = !online;
  });
}
