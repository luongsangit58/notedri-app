import { Alert } from 'react-native';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuthStore } from '../../store/authStore';
import { useI18nStore } from '../../i18n';
import { resolveDefaultVehicle } from '../vehicles/resolveDefaultVehicle';

// Đến từ thẻ NFC/App Link https://notedri.com/connect (KHÔNG mang vehicleId/deviceId
// như notedri://autodrive - xem NfcService/handleAutoDriveLink). Dùng cho thẻ PHÁT
// HÀNG LOẠT giống hệt nhau (in sẵn gửi khách) nên không thể khắc riêng ID từng xe.
//
// Rà soát 17/7 (phản hồi Sang): trước đây suy xe bằng "thiết bị BLE ghép GẦN NHẤT"
// (getMostRecentPairing) - SAI ngữ nghĩa cho 1 thẻ đại diện "xe của tôi": ai có
// >1 xe/adapter từng ghép trên cùng máy (vd vừa ghép hộ/test xe người khác) sẽ bị
// đưa nhầm sang xe đó thay vì đúng xe mà thẻ này gắn lên. Đổi sang XE MẶC ĐỊNH
// (is_default) - cùng quy ước mọi màn hình khác trong app đã dùng (Home,
// AddRefuel, Reminders, GpsTrips...), không dựa vào lịch sử BLE nữa.
//
// Không tự tra pairing/thiết bị ở đây nữa: OBDSetupScreen đã tự
// getPairingForVehicle(vehicleId) và auto-connect nếu có (xem useEffect
// pairedDeviceId trong OBDSetupScreen.tsx) - truyền thẳng vehicleId mặc định là đủ,
// kể cả khi xe đó CHƯA từng ghép OBD2 (lần đầu dùng thẻ) thì vẫn vào đúng màn hình
// để quét/ghép mới, thay vì chặn hẳn bằng Alert như logic cũ.
export async function handleConnectLink(): Promise<void> {
  // Cold start: đợi NavigationContainer sẵn sàng, cùng cơ chế với handleAutoDriveLink
  // (tối đa ~3s thay vì đoán 1 mốc thời gian cố định).
  const deadline = Date.now() + 3000;
  while (!navigationRef.isReady() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!navigationRef.isReady()) return;

  // 'OBDSetup' chỉ tồn tại trong AppNavigator (mount khi có token) - phải đợi sau vòng
  // lặp trên vì lúc gọi từ Linking.getInitialURL() ở cold start, token chưa kịp hydrate.
  if (!useAuthStore.getState().token) return;

  const vehicle = await resolveDefaultVehicle();
  if (!vehicle) {
    const t = useI18nStore.getState().t;
    Alert.alert(t('obd.nfc_no_vehicle_title'), t('obd.nfc_no_vehicle_body'));
    return;
  }

  navigationRef.navigate('OBDSetup', {
    vehicleId: vehicle.id,
    vehicleName: vehicle.ten,
  });
}
