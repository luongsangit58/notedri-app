import { Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useI18nStore } from '../../i18n';

// Rà soát 17/7 (user hỏi: khoá màn hình sau khi kết nối OBD2 có ảnh hưởng gì
// không?) - obdKeepAliveService.ts CHỈ giữ được tiến trình JS sống khi quyền vị
// trí NỀN đã được cấp sẵn, và trước đây quyền này chỉ được xin từ luồng onboarding
// GPS trip - user CHỈ dùng OBD2 (chưa từng bật GPS trip) không có quyền này, nên
// khoá màn hình là mất toàn bộ polling gần như ngay lập tức (kể cả cảnh báo mã
// lỗi mới). Chủ động xin quyền ngay lúc kết nối OBD2, với lý do RIÊNG cho OBD2
// (không dùng lại lý do GPS - user có thể không liên tưởng OBD2 với "hành trình").

// Chỉ hỏi 1 lần/phiên mở app (dù bị từ chối) - tránh hỏi lại mỗi lần kết nối lại
// dongle trong cùng phiên sử dụng, gây phiền.
let askedThisAppSession = false;

// platformOS tách riêng làm tham số (mặc định Platform.OS thật), cùng lý do với
// obdKeepAliveService.ts: Platform.OS không gán trực tiếp được trong Jest.
export async function ensureObdBackgroundPermission(platformOS: string = Platform.OS): Promise<void> {
  if (platformOS !== 'android') return; // obdKeepAliveService cũng chỉ Android
  if (askedThisAppSession) return;

  const current = await Location.getBackgroundPermissionsAsync().catch(() => null);
  if (!current || current.status === 'granted' || !current.canAskAgain) {
    askedThisAppSession = true;
    return;
  }

  askedThisAppSession = true;

  const t = useI18nStore.getState().t;
  const proceed = await new Promise<boolean>((resolve) => {
    Alert.alert(
      t('obd.background_permission_title'),
      t('obd.background_permission_body'),
      [
        { text: t('gps_trips.disclosure_cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('gps_trips.disclosure_continue'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
  if (!proceed) return;

  await Location.requestBackgroundPermissionsAsync().catch(() => {});
}

/** Chỉ dùng trong test - reset cờ "đã hỏi trong phiên app" giữa các test case. */
export function __resetAskedForTest(): void {
  askedThisAppSession = false;
}
