import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useI18nStore } from '../../i18n';
import { DtcCode } from './ObdReader';

const KEY = 'obd_notified_dtc';

// Mã lỗi ĐÃ báo push và còn coi là "đang tồn tại", theo từng xe. Bền vững qua nhiều
// lần kết nối - khác `reportedCodes` trong obdLiveMonitor.ts (chỉ sống trong RAM,
// reset mỗi lần start()), nên không báo lại spam mỗi lần cắm lại dongle cho 1 lỗi
// đã biết mà user chưa/không sửa (rà soát 17/7: user hỏi rõ case này).
async function readAll(): Promise<Record<number, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeAll(map: Record<number, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch { /* lưu thất bại thì lần poll sau thử lại, không chặn phiên OBD2 */ }
}

/**
 * So khớp mã lỗi hiện tại (đọc live) với mã đã từng báo cho xe này:
 * - Mã THỰC SỰ MỚI (chưa từng báo, hoặc đã từng biến mất rồi tái xuất hiện) -> báo push.
 * - Mã đã báo trước đó nhưng KHÔNG còn xuất hiện ở lần đọc này (xe đã sửa/mã tự xoá
 *   sau nhiều chu kỳ lái đạt chuẩn) -> âm thầm bỏ khỏi danh sách đã báo, để nếu mã đó
 *   quay lại sau này vẫn được coi là mới, không bị "khoá" báo vĩnh viễn.
 * Không tự bắn thông báo nếu OS đã bị user tắt quyền thông báo (try/catch nuốt lỗi,
 * cùng quy ước "notifications non-critical" như GpsTripTracker).
 */
export async function syncDtcNotifications(vehicleId: number, currentCodes: DtcCode[]): Promise<void> {
  const map = await readAll();
  const known = new Set(map[vehicleId] ?? []);
  const currentSet = new Set(currentCodes.map((c) => c.code));

  const toNotify = currentCodes.filter((c) => !known.has(c.code));
  toNotify.forEach((c) => known.add(c.code));
  Array.from(known).forEach((code) => {
    if (!currentSet.has(code)) known.delete(code);
  });

  map[vehicleId] = Array.from(known);
  await writeAll(map);

  if (toNotify.length === 0) return;

  const t = useI18nStore.getState().t;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: t('obd.dtc_notif_title'),
        body: toNotify.length === 1
          ? t('obd.dtc_notif_body_single', { code: toNotify[0].code })
          : t('obd.dtc_notif_body_multi', { count: toNotify.length, codes: toNotify.map((c) => c.code).join(', ') }),
        data: { type: 'dtc_alert', vehicleId },
      },
      trigger: null,
    });
  } catch { /* notifications non-critical */ }
}
