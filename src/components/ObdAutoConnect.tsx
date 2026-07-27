import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { State as BleAdapterState } from 'react-native-ble-plx';
import NotedriBtPairing from '../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';
import { useAuthStore } from '../store/authStore';
import { bleService } from '../services/obd/BleService';
import { getAutoConnectPairing } from '../services/obd/pairedDevices';
import { resolveDefaultVehicle } from '../services/vehicles/resolveDefaultVehicle';
import { useObdConnection } from '../hooks/useObd';
import { navigationRef } from '../navigation/navigationRef';

// Không thử lại liên tục mỗi lần app chuyển nền/tiền cảnh nhanh (vd kéo thanh
// thông báo rồi đóng lại) - tốn pin/radio Bluetooth vô ích cho 1 thao tác vài
// giây không có ý định mở lại app thật sự.
const COOLDOWN_MS = 60_000;
// Đợi vài giây sau khi app mở/quay lại foreground rồi mới bật Bluetooth quét
// (góp ý 25/7) - KHÔNG liên quan gì tới việc có tự chuyển màn hình hay không,
// chỉ để nhường tài nguyên cho app xong việc load Home/token trước, tránh
// tranh chấp ngay lúc khởi động.
const INITIAL_ATTEMPT_DELAY_MS = 5000;
// Trùng mốc auto-stop 15s của startScan() (useObd.ts) + chút dư cho vòng
// render cuối, không tự đặt mốc riêng dễ lệch nếu bên kia đổi.
const BLE_ATTEMPT_TIMEOUT_MS = 16_000;

// Đang tự tay thao tác ở đúng 2 màn này - không tự quét/connect chồng lên,
// tránh 2 luồng cùng gọi scanForDevices()/connect() gây xung đột adapter.
const SKIP_ON_ROUTES = new Set(['OBDSetup', 'OBDDashboard']);

type AttemptTarget = {
  vehicleId: number;
  vehicleName: string;
  deviceId: string;
  transport: 'ble' | 'classic';
};

/**
 * Thực thi 1 lần thử auto-connect headless - mount ra là chạy, unmount là dừng
 * hẳn (không còn gì sống lại phía sau nếu thất bại). Dùng LẠI đúng hook
 * useObdConnection() màn OBDSetupScreen dùng (không viết lại logic connect
 * riêng) để mọi side-effect (obdSessionStore, obdLiveMonitor, savePairing...)
 * xảy ra giống hệt 1 lần kết nối thủ công bình thường.
 */
function AutoConnectAttempt({ target, onDone }: { target: AttemptTarget; onDone: () => void }) {
  const { connectionState, foundDevices, startScan, connect, connectClassic } =
    useObdConnection(target.vehicleId, target.vehicleName);
  const settledRef = useRef(false);

  function settle() {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone();
  }

  // Đây là tính năng OPT-IN (user tự bật switch) - khác banner/toast thụ động
  // của luồng kết nối thủ công, tự chuyển thẳng vào OBD2 Live khi thành công
  // đúng là điều user đã chủ động chọn khi bật switch, không còn là hành vi
  // "tự tiện" nữa (góp ý 25/7).
  function goToDashboard(deviceName: string) {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('OBDDashboard', {
      vehicleId: target.vehicleId,
      vehicleName: target.vehicleName,
      deviceName,
      consumptionOfficial: null,
    });
  }

  useEffect(() => {
    let cancelled = false;
    if (target.transport === 'classic') {
      // Danh sách đã ghép nạp gần như tức thì (không phải quét sống) - không
      // cần vòng lặp theo dõi như BLE bên dưới.
      NotedriBtPairing.discoverDevices()
        .then(async (found) => {
          if (cancelled || settledRef.current) return;
          const match = found.find((d) => d.address === target.deviceId);
          if (!match) { settle(); return; }
          const ok = await connectClassic(match.address, match.name);
          if (ok && !cancelled) goToDashboard(match.name);
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) settle(); });
      return () => { cancelled = true; };
    }

    // BLE: quyền + trạng thái Bluetooth ĐÃ được kiểm tra trước khi mount
    // component này (xem ObdAutoConnect bên dưới) - startScan() ở đây chỉ nên
    // chạy khi các điều kiện đó đã sẵn sàng, không tự xin gì thêm.
    startScan(false);
    const timeout = setTimeout(settle, BLE_ATTEMPT_TIMEOUT_MS);
    return () => { cancelled = true; clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (target.transport !== 'ble' || settledRef.current) return;
    const match = foundDevices.find((d) => d.id === target.deviceId);
    if (!match) return;
    settledRef.current = true; // chặn timeout gọi settle() lần 2 trong lúc đang connect
    connect(match.id)
      .then((ok) => { if (ok) goToDashboard(match.name); })
      .finally(onDone);
  }, [foundDevices]);

  // Hết giờ mà connectionState rơi về lỗi (vd BT vừa tắt giữa chừng) - dừng
  // sớm thay vì chờ hết 16s vô ích.
  useEffect(() => {
    if (connectionState === 'error') settle();
  }, [connectionState]);

  return null;
}

/**
 * Rà soát 25/7 (góp ý user: kết nối OBD2 lần 1 xong, tắt/mở lại app không tự
 * kết nối lại) - component ẩn, mount 1 lần cạnh ObdSessionBanner (App.tsx).
 * Thành công thì tự chuyển thẳng vào OBD2 Live (goToDashboard trong
 * AutoConnectAttempt) - hợp lý vì đây là tính năng OPT-IN, user đã chủ động
 * bật switch nên không còn là hành vi "tự tiện" nữa. Thất bại thì im lặng,
 * không toast lỗi, không thử lại cho tới lần mở/quay lại app kế tiếp (có
 * cooldown).
 *
 * Đây là tính năng OPT-IN theo từng xe (PairedDevice.autoConnect, bật ở
 * OBDSetupScreen) - mặc định KHÔNG bật cho ai, tránh quét BLE tốn pin mỗi lần
 * mở app kể cả khi không ở trong xe.
 */
export default function ObdAutoConnect() {
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const token = useAuthStore((s) => s.token);
  const [target, setTarget] = useState<AttemptTarget | null>(null);
  const lastAttemptAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function tryAutoConnect() {
    if (!isPremium || !token) return;
    if (target) return; // đã có 1 lượt thử đang chạy
    if (Date.now() - lastAttemptAtRef.current < COOLDOWN_MS) return;
    if (bleService.isConnected()) return; // đã kết nối sẵn (vd sống sót qua nền)

    const routeName = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
    if (routeName && SKIP_ON_ROUTES.has(routeName)) return;

    // Ưu tiên xe mặc định nếu >1 xe cùng bật auto-connect (xem comment
    // getAutoConnectPairing() ở pairedDevices.ts) - đồng bộ với đường vào NFC/App
    // Link (handleConnectLink.ts) để 2 đường không chọn ra 2 xe khác nhau.
    const defaultVehicle = await resolveDefaultVehicle();
    const pairing = await getAutoConnectPairing(defaultVehicle?.id);
    if (!pairing) return; // chưa xe nào bật auto-connect

    // Không tự xin quyền/bật hộ Bluetooth từ nền - chỉ chạy khi cả 2 đã sẵn
    // có từ trước (đã cấp lúc kết nối thủ công lần đầu). Thiếu 1 trong 2 thì
    // bỏ qua im lặng, để user tự vào OBDSetupScreen xử lý như bình thường.
    const btState = await bleService.getBluetoothState();
    if (btState !== BleAdapterState.PoweredOn) return;
    const hasPerms = await bleService.hasScanPermissions();
    if (!hasPerms) return;

    lastAttemptAtRef.current = Date.now();
    setTarget({
      vehicleId: pairing.vehicleId,
      vehicleName: pairing.vehicleName,
      deviceId: pairing.bleDeviceId,
      transport: pairing.transport ?? 'ble',
    });
  }

  // Đợi INITIAL_ATTEMPT_DELAY_MS rồi mới thật sự thử - không gọi tryAutoConnect
  // ngay lúc app vừa mở/vừa quay lại foreground (xem giải thích ở hằng số).
  function scheduleAutoConnect() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      tryAutoConnect();
    }, INITIAL_ATTEMPT_DELAY_MS);
  }

  useEffect(() => {
    scheduleAutoConnect();
    return () => { if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium, token]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      // Chỉ khi THỰC SỰ quay lại từ nền - không fire ở mọi đổi trạng thái (vd
      // 'active' lặp lại) tránh quét dư thừa không cần thiết.
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        scheduleAutoConnect();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium, token]);

  if (!target) return null;
  return <AutoConnectAttempt target={target} onDone={() => setTarget(null)} />;
}
