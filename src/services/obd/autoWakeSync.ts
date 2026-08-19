import { Platform } from 'react-native';
import NotedriBtPairing from '../../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';
import { getAllPairedDevices } from './pairedDevices';
import { useObdAutoConnectSettingsStore } from '../../store/obdAutoConnectSettingsStore';

// Đồng bộ danh sách MAC (Classic)/deviceId (BLE) đủ điều kiện "tự thức app khi
// Bluetooth kết nối lại KW906" (AclConnectedReceiver/BleScanResultReceiver
// phía native, xem modules/notedri-bt-pairing) - gọi lại mỗi khi pairing hoặc
// switch auto-connect đổi (savePairing/removePairingForVehicle/clearPairings/
// setAutoConnect ở pairedDevices.ts, setEnabled ở obdAutoConnectSettingsStore.ts)
// + 1 lần lúc khởi động app (App.tsx) để đối soát lại cache native (phòng lần
// đồng bộ trước lỗi, hoặc app vừa cài lại).
//
// KHÔNG kiểm tra isPremium/token/sessionSuppressed ở đây - cache này chỉ quyết
// định "có đáng mở app lên không", còn mọi điều kiện kết nối thật (premium,
// đăng nhập, tạm dừng trong phiên...) vẫn do ObdAutoConnect.tsx tự kiểm tra lại
// sau khi app đã mở, giống hệt lúc user mở app tay - không nhân bản logic đó
// ra native để tránh 2 nơi có thể lệch nhau.
export async function syncAutoWakeDevices(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const masterEnabled = useObdAutoConnectSettingsStore.getState().enabled;
  const devices = masterEnabled ? await getAllPairedDevices() : [];
  // !== false: cùng quy ước với getAutoConnectPairing() ở pairedDevices.ts -
  // pairing cũ (lưu trước 31/7) không có field autoConnect coi như đã bật.
  const eligible = devices.filter((d) => d.autoConnect !== false);

  const classicMacs = eligible.filter((d) => d.transport === 'classic').map((d) => d.bleDeviceId);
  const bleMacs = eligible.filter((d) => (d.transport ?? 'ble') === 'ble').map((d) => d.bleDeviceId);

  await NotedriBtPairing.syncAutoWakeDevices(classicMacs, bleMacs).catch(() => {});
}
