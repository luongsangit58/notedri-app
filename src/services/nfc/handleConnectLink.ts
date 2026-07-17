import { Alert } from 'react-native';
import { navigationRef } from '../../navigation/navigationRef';
import { vehiclesApi } from '../../api/vehicles';
import { queryClient } from '../../api/queryClient';
import { useAuthStore } from '../../store/authStore';
import { useI18nStore } from '../../i18n';

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

type VehicleLite = { id: number; ten: string; is_default?: boolean };

function pickDefault(list: VehicleLite[]): VehicleLite | null {
  if (list.length === 0) return null;
  return list.find((v) => v.is_default) ?? list[0];
}

// Ưu tiên cache React Query (Home/Dashboard hầu như luôn đã fetch xong lúc app vừa
// mở) - đỡ 1 round-trip mạng; chỉ gọi thẳng API khi cache trống (cold start rất sớm,
// vd mở thẳng bằng cách chạm NFC lúc app chưa từng mở lần nào).
async function resolveDefaultVehicle(): Promise<VehicleLite | null> {
  const cached: any = queryClient.getQueryData(['vehicles']);
  const cachedList: VehicleLite[] = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
  if (cachedList.length > 0) return pickDefault(cachedList);

  try {
    const res = await vehiclesApi.list();
    const list: VehicleLite[] = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
    return pickDefault(list);
  } catch {
    return null;
  }
}
