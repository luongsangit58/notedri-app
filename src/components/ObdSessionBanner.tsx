import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useObdSessionStore } from '../store/obdSessionStore';
import { navigationRef } from '../navigation/navigationRef';
import { useT } from '../i18n';

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
  const { connected, reconnecting, vehicleId, vehicleName, tripActive } = useObdSessionStore();
  const [routeName, setRouteName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const update = () => {
      if (navigationRef.isReady()) setRouteName(navigationRef.getCurrentRoute()?.name);
    };
    update();
    const unsubscribe = navigationRef.addListener('state', update);
    return unsubscribe;
  }, [connected, reconnecting]);

  if (!connected && !reconnecting) return null;
  if (routeName && HIDDEN_ON.has(routeName)) return null;

  const color = reconnecting ? '#F59E0B' : '#22C55E';
  const label = reconnecting
    ? t('obd.banner_reconnecting')
    : tripActive
    ? t('obd.banner_trip', { name: vehicleName ?? 'OBD2' })
    : t('obd.banner_connected', { name: vehicleName ?? 'OBD2' });

  return (
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
  );
}
