import { Alert } from 'react-native';
import { navigationRef } from '../../navigation/navigationRef';
import { getMostRecentPairing } from '../obd/pairedDevices';
import { useAuthStore } from '../../store/authStore';
import { useI18nStore } from '../../i18n';

// Đến từ thẻ NFC/App Link https://notedri.com/connect (KHÔNG mang vehicleId/deviceId
// như notedri://autodrive - xem NfcService/handleAutoDriveLink). Vì URL không cho biết
// trước xe/adapter nào, dùng pairing gần nhất (getPairingForVehicle không áp dụng được ở
// đây) để suy ra - giống hệt cơ chế "Kết nối OBD2 nhanh" đã có ở Home.
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

  const pairing = await getMostRecentPairing();
  if (!pairing) {
    const t = useI18nStore.getState().t;
    Alert.alert(t('obd.nfc_no_pairing_title'), t('obd.nfc_no_pairing_body'));
    return;
  }

  navigationRef.navigate('OBDSetup', {
    vehicleId: pairing.vehicleId,
    vehicleName: pairing.vehicleName,
    autoConnectDeviceId: pairing.bleDeviceId,
  });
}
