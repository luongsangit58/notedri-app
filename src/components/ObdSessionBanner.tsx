import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useObdSessionStore } from '../store/obdSessionStore';
import { navigationRef } from '../navigation/navigationRef';
import { useT } from '../i18n';

/**
 * Toast chuyển trạng thái kết nối (Sang góp ý 14/7: "đã kết nối/mất kết nối
 * chưa có phản hồi rõ"): hiện ở đỉnh màn hình khi trạng thái ĐỔI - kết nối
 * xong, nối lại thành công, mất kết nối hẳn. Bổ trợ cho pill (trạng thái
 * liên tục) bằng phản hồi tức thời tại thời điểm chuyển.
 *
 * Rà soát 22/7 (góp ý user: trên màn hình xe luôn bật, có lúc thông báo tắt
 * trước khi kịp đọc): 2,5s cố định là quá ngắn cho ngữ cảnh lái xe (mắt không
 * luôn ở màn hình). Tăng thời lượng và cho chạm-để-tắt sớm thay vì khoá cứng
 * pointerEvents="none".
 */
const TOAST_DURATION_MS = 4500;
const TOAST_DURATION_SAVED_MS = 6000; // tin "phiên đã lưu N phút" dài hơn, cần đọc lâu hơn

function useTransitionToast(): [string | null, () => void] {
  const t = useT();
  const { connected, reconnecting, vehicleName, lastSessionSaved } = useObdSessionStore();
  const [toast, setToast] = useState<string | null>(null);
  const prev = useRef({ connected: false, reconnecting: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const was = prev.current;
    let message: string | null = null;
    let justSaved = false;

    if (!was.connected && connected) {
      message = was.reconnecting
        ? t('obd.toast_reconnected')
        : t('obd.toast_connected', { name: vehicleName ?? 'OBD2' });
    } else if (was.connected && !connected && !reconnecting) {
      // Rà soát 16/7 (góp ý user: kết thúc phiên không có phản hồi gì): nếu
      // obdLiveMonitor vừa patch lastSessionSaved đồng bộ NGAY trước lúc connected
      // chuyển false (xem obdLiveMonitor.ts) - tức phiên có dữ liệu thật - báo
      // rõ đã tổng hợp/lưu thay vì chỉ "mất kết nối" chung chung. Chỉ dùng khi
      // vừa mới ghi (<5s) để không hiện nhầm cho 1 phiên đã lưu từ rất lâu trước.
      justSaved = !!(lastSessionSaved && Date.now() - lastSessionSaved.ts < 5000 && lastSessionSaved.samples > 0);
      message = justSaved
        ? t('obd.toast_session_saved', { minutes: Math.max(1, Math.round(lastSessionSaved!.durationSeconds / 60)) })
        : t('obd.toast_disconnected');
    }

    prev.current = { connected, reconnecting };
    if (message) {
      setToast(message);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => setToast(null),
        justSaved ? TOAST_DURATION_SAVED_MS : TOAST_DURATION_MS,
      );
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [connected, reconnecting]);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  };

  return [toast, dismiss];
}

// Các màn đã tự hiển thị trạng thái OBD - banner ở đó là thừa
const HIDDEN_ON = new Set(['OBDSetup', 'OBDDashboard', 'OBDTrips', 'NfcSetup']);

/**
 * Banner mini "phiên OBD đang sống" (C5 tầng 2): kiểu thanh cuộc-gọi-đang-diễn-ra,
 * hiện ở mọi màn khi đang kết nối/kết nối lại - kết nối không còn tàng hình khi
 * rời Dashboard. Chạm là quay về Dashboard (qua OBDSetup - màn này tự chuyển tiếp
 * khi phiên còn sống).
 */
export default function ObdSessionBanner() {
  const t = useT();
  const { connected, reconnecting, vehicleId, vehicleName } = useObdSessionStore();
  const [routeName, setRouteName] = useState<string | undefined>(undefined);
  const [toast, dismissToast] = useTransitionToast();

  useEffect(() => {
    const update = () => {
      if (navigationRef.isReady()) setRouteName(navigationRef.getCurrentRoute()?.name);
    };
    update();
    const unsubscribe = navigationRef.addListener('state', update);
    return unsubscribe;
  }, [connected, reconnecting]);

  // Toast render ĐỘC LẬP với pill: toast "mất kết nối" bắn đúng lúc pill biến mất.
  // pointerEvents="auto" + onPress: cho tắt sớm bằng tay khi đã đọc xong, thay vì
  // chặn hết tương tác bên dưới cho tới khi hết giờ.
  const toastView = toast ? (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={dismissToast}
      style={{
        position: 'absolute',
        top: 60,
        alignSelf: 'center',
        backgroundColor: '#0f172aee',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{toast}</Text>
    </TouchableOpacity>
  ) : null;

  if (!connected && !reconnecting) return toastView;
  if (routeName && HIDDEN_ON.has(routeName)) return toastView;

  const color = reconnecting ? '#F59E0B' : '#22C55E';
  const label = reconnecting
    ? t('obd.banner_reconnecting')
    : t('obd.banner_connected', { name: vehicleName ?? 'OBD2' });

  return (
    <>
    {toastView}
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => {
        if (!vehicleId || !navigationRef.isReady()) return;
        navigationRef.navigate('OBDSetup', { vehicleId, vehicleName: vehicleName ?? '' });
      }}
      style={{
        position: 'absolute',
        bottom: 96,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#0f172aee',
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: color + '66',
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Text>
      <FontAwesome5 name="chevron-right" size={10} color="#94a3b8" />
    </TouchableOpacity>
    </>
  );
}
