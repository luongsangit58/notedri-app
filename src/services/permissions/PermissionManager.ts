import { Platform, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import { showBackgroundLocationDisclosure } from './backgroundLocationDisclosure';

/**
 * Nơi DUY NHẤT trong app được gọi `PermissionsAndroid`/`Location.request*`/`Camera.request*`/...
 * (mục tiêu refactor: gom permission về 1 chỗ, UI/service khác không tự gọi thẳng API permission
 * gốc nữa). Trước đây logic này rải rác ở BleService.ts, GpsTripTracker.ts,
 * obdKeepAliveService.ts, OcrCamera.tsx, useVoiceInput.ts, pushNotifications.ts - đặc biệt 2 nơi
 * (GpsTripTracker/obdKeepAliveService) tự viết TRÙNG NHAU chuỗi "foreground -> disclosure ->
 * background" gần như y hệt.
 *
 * Kết quả trả về thống nhất `PermissionResult` cho MỌI hàm - tất cả API permission gốc (expo-*)
 * đều cùng shape `PermissionResponse` (granted/canAskAgain/status) nên chuẩn hoá được về 1 kiểu
 * chung, kể cả Bluetooth (PermissionsAndroid.RESULTS tự quy đổi về cùng shape ở đây).
 *
 * Camera/ImagePicker/Notifications/SpeechRecognition dùng `require()` TRỄ (ngay trong hàm, không
 * import tĩnh ở đầu file) - PermissionManager là module DÙNG CHUNG cho mọi luồng (BLE, GPS...),
 * import tĩnh sẽ kéo theo TOÀN BỘ native module chain (kể cả speech-recognition/camera) vào bất kỳ
 * ai chỉ cần gọi requestBluetooth()/requestLocationForeground() - từng vỡ test thật
 * (obdKeepAliveService.test.ts và các test BLE khác fail vì "Cannot find native module
 * ExpoSpeechRecognition" - module đó không hề liên quan tới BLE/OBD nhưng vẫn bị kéo theo qua
 * import tĩnh). Cùng nguyên tắc "không kéo theo chuỗi phụ thuộc nặng không cần thiết" đã áp dụng
 * ở obdKeepAliveService.ts (không import thẳng GpsTripTracker.ts vì kéo theo expo-notifications).
 */
export type PermissionResult = { granted: boolean; canAskAgain: boolean };

// `status === 'granted'` là nguồn sự thật (không chỉ đọc `.granted`) - fallback này CẦN THIẾT vì
// toàn bộ test double/mock permission response hiện có trong repo (obdKeepAliveService.test.ts,
// GpsTripTracker...) chỉ set `{ status: 'granted' }`, không set field `.granted` boolean riêng dù
// PermissionResponse thật (expo-modules-core) có cả 2 field - đọc thẳng `.granted` sẽ luôn ra
// `undefined`/falsy với các mock đó, âm thầm coi MỌI quyền là chưa cấp.
function fromExpoResponse(r: { status?: string; granted?: boolean; canAskAgain?: boolean }): PermissionResult {
  return {
    granted: r.granted ?? r.status === 'granted',
    canAskAgain: r.canAskAgain ?? true,
  };
}

// ---------------------------------------------------------------------------
// Bluetooth (OBD2) - chuyển nguyên logic từ BleService.requestPermissions()/
// hasScanPermissions() (rà soát 25/7 gốc, giữ nguyên comment giải thích quyết định).
// ---------------------------------------------------------------------------

/** Kiểm tra quyền HIỆN CÓ, KHÔNG xin thêm - dùng cho auto-connect chạy nền lúc mở app (tự động
 * quét ngầm mà bật popup xin quyền không rõ ngữ cảnh là kiểu "phiền" cần tránh). */
async function hasBluetooth(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (Platform.Version >= 31) {
      const [scan, connect] = await Promise.all([
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN),
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT),
      ]);
      return scan && connect;
    }
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  } catch {
    // Không xác định được -> coi như CHƯA có, để auto-connect bỏ qua im lặng thay vì lỡ tay
    // gọi tiếp startScan() rồi tự bật popup xin quyền.
    return false;
  }
}

/** Xin quyền quét/kết nối BLE - CHỈ nên gọi khi user tự tay vào màn kết nối OBD2 (bấm "Kết nối
 * OBD2"/"Quét lại"), không gọi từ auto-connect chạy nền (dùng hasBluetooth() ở trên cho việc đó). */
async function requestBluetooth(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') return { granted: true, canAskAgain: true };

  // BLUETOOTH_SCAN/BLUETOOTH_CONNECT chỉ tồn tại từ Android 12 (API 31) trở lên. Trên đầu
  // Android ô tô đời cũ (thường Android 9/10), xin 2 quyền này qua requestMultiple khiến vài ROM
  // tuỳ biến trả về "denied" cho quyền không tồn tại thay vì bỏ qua, làm cả nhóm luôn fail vĩnh
  // viễn. Trước 12, BLUETOOTH/BLUETOOTH_ADMIN là quyền cài-đặt-thời (không cần xin runtime) nên
  // chỉ cần xin vị trí để quét BLE.
  //
  // BLUETOOTH_SCAN đã khai báo cờ neverForLocation trong manifest (app.json plugin
  // react-native-ble-plx) - app không suy ra vị trí thật từ kết quả quét, nên KHÔNG cần xin
  // ACCESS_FINE_LOCATION nữa trên API 31+.
  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    const granted = Object.values(result).every((r) => r === PermissionsAndroid.RESULTS.GRANTED);
    const canAskAgain = Object.values(result).every((r) => r !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    return { granted, canAskAgain };
  }

  // API <31: BLUETOOTH_SCAN/CONNECT chưa tồn tại, OS bắt buộc phải có vị trí để quét BLE
  // (neverForLocation chỉ áp dụng từ API 31) - không có cách nào tránh xin quyền này trên bản
  // Android cũ.
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return { granted: result === PermissionsAndroid.RESULTS.GRANTED, canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN };
}

// ---------------------------------------------------------------------------
// Location (foreground + background) - gộp chuỗi "foreground -> disclosure -> background" trước
// đây bị viết trùng ở GpsTripTracker.ts và obdKeepAliveService.ts.
// ---------------------------------------------------------------------------

async function getLocationForegroundStatus(): Promise<PermissionResult> {
  return fromExpoResponse(await Location.getForegroundPermissionsAsync());
}

async function requestLocationForeground(): Promise<PermissionResult> {
  return fromExpoResponse(await Location.requestForegroundPermissionsAsync());
}

async function getLocationBackgroundStatus(): Promise<PermissionResult> {
  return fromExpoResponse(await Location.getBackgroundPermissionsAsync());
}

/**
 * Google Play bắt buộc phải "công bố nổi bật" (prominent disclosure) lý do xin vị trí NỀN trước
 * khi hộp thoại hệ thống hiện ra, và bắt buộc đã có quyền foreground trước khi xin được quyền
 * nền. `disclosure` truyền vào để mỗi tính năng (GPS trip, OBD keep-alive) vẫn giữ ngữ cảnh riêng
 * trong dialog, dù dùng chung 1 luồng xin quyền.
 */
async function requestLocationBackground(disclosure: { titleKey: string; bodyKey: string }): Promise<PermissionResult> {
  const existing = await Location.getBackgroundPermissionsAsync().catch(() => null);
  const existingResult = existing ? fromExpoResponse(existing) : null;
  if (existingResult?.granted) return existingResult;

  const proceed = await showBackgroundLocationDisclosure(disclosure.titleKey, disclosure.bodyKey);
  if (!proceed) return { granted: false, canAskAgain: true };

  // Android bắt buộc phải có quyền foreground TRƯỚC khi xin được quyền nền.
  const fg = await requestLocationForeground();
  if (!fg.granted) return { granted: false, canAskAgain: fg.canAskAgain };

  return fromExpoResponse(await Location.requestBackgroundPermissionsAsync());
}

// ---------------------------------------------------------------------------
// Camera (OCR hoá đơn/ODO)
// ---------------------------------------------------------------------------

async function getCameraStatus(): Promise<PermissionResult> {
  const { Camera } = require('expo-camera');
  return fromExpoResponse(await Camera.getCameraPermissionsAsync());
}

async function requestCamera(): Promise<PermissionResult> {
  const { Camera } = require('expo-camera');
  return fromExpoResponse(await Camera.requestCameraPermissionsAsync());
}

// ---------------------------------------------------------------------------
// Thư viện ảnh (chọn ảnh hoá đơn/avatar xe)
// ---------------------------------------------------------------------------

async function requestMediaLibrary(): Promise<PermissionResult> {
  const ImagePicker = require('expo-image-picker');
  return fromExpoResponse(await ImagePicker.requestMediaLibraryPermissionsAsync());
}

// ---------------------------------------------------------------------------
// Microphone / nhận diện giọng nói
// ---------------------------------------------------------------------------

async function requestMicrophone(): Promise<PermissionResult> {
  const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
  return fromExpoResponse(await ExpoSpeechRecognitionModule.requestPermissionsAsync());
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function getNotificationStatus(): Promise<PermissionResult> {
  const Notifications = require('expo-notifications');
  return fromExpoResponse(await Notifications.getPermissionsAsync());
}

async function requestNotifications(): Promise<PermissionResult> {
  const Notifications = require('expo-notifications');
  const existing = fromExpoResponse(await Notifications.getPermissionsAsync());
  if (existing.granted) return existing;
  return fromExpoResponse(await Notifications.requestPermissionsAsync());
}

export const PermissionManager = {
  hasBluetooth,
  requestBluetooth,
  getLocationForegroundStatus,
  requestLocationForeground,
  getLocationBackgroundStatus,
  requestLocationBackground,
  getCameraStatus,
  requestCamera,
  requestMediaLibrary,
  requestMicrophone,
  getNotificationStatus,
  requestNotifications,
};
