import { navigationRef } from '../../navigation/navigationRef';
import { parseAutoDriveUrl } from './NfcService';
import { getPairingForVehicle } from '../obd/pairedDevices';
import { useAuthStore } from '../../store/authStore';

// Chạm NFC (hoặc bất kỳ nguồn notedri://autodrive nào khác) -> mở thẳng OBDSetup
// với deviceId đã biết trước, KHÔNG mở Dashboard ngay (chỉ mở sau khi kết nối
// thành công), đúng nguyên tắc Deep Link trong tài liệu thiết kế.
export async function handleAutoDriveLink(url: string | null): Promise<void> {
  if (!url) return;
  const link = parseAutoDriveUrl(url);
  if (!link) return;

  const pairing = await getPairingForVehicle(link.vehicleId);

  const navigate = () => {
    navigationRef.navigate('OBDSetup', {
      vehicleId: link.vehicleId,
      vehicleName: pairing?.vehicleName ?? '',
      autoConnectDeviceId: link.bleDeviceId,
    });
  };

  // Cold start: NavigationContainer chưa mount kịp lúc URL đến - đợi tới khi sẵn
  // sàng (tối đa ~3s) thay vì đoán 1 mốc thời gian cố định.
  const deadline = Date.now() + 3000;
  while (!navigationRef.isReady() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!navigationRef.isReady()) return;

  // 'OBDSetup' chỉ tồn tại trong AppNavigator (RootNavigator chỉ mount cây này khi
  // có token) - kiểm tra token PHẢI đợi sau vòng lặp trên, không phải ngay đầu hàm:
  // lúc handleAutoDriveLink chạy từ Linking.getInitialURL() ở cold start, auth
  // store còn ở giá trị mặc định (token=null) vì initialize() (đọc từ storage)
  // chưa kịp xong - kiểm tra sớm sẽ luôn bỏ qua NFC kể cả user thực ra đã đăng
  // nhập. Đợi navigationRef sẵn sàng đảm bảo RootNavigator đã qua isLoading và
  // token đã được hydrate thật.
  if (!useAuthStore.getState().token) return;

  navigate();
}
