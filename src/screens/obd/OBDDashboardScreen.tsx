import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useObdConnection } from '../../hooks/useObd';
import { bleService, LinkQuality } from '../../services/obd/BleService';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

function StatBox({
  label,
  value,
  unit,
  icon,
  color = '#3B82F6',
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  icon: string;
  color?: string;
}) {
  const colors = useColors();
  return (
    <View style={[statStyles.box, { backgroundColor: colors.card }]}>
      <FontAwesome5 name={icon} size={16} color={color} />
      <Text style={[statStyles.value, { color: colors.text }]}>
        {value !== null ? `${value}${unit ?? ''}` : '-'}
      </Text>
      <Text style={[statStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  box: { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center', gap: 4, minWidth: 80 },
  value: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: 11, textAlign: 'center' },
});

export default function OBDDashboardScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const deviceName: string = route.params?.deviceName ?? 'OBD';
  const vehicleName: string = route.params?.vehicleName ?? '';
  const consumptionOfficial: number | null = route.params?.consumptionOfficial ?? null;

  const t = useT();
  const colors = useColors();
  const {
    connectionState,
    liveSnapshot,
    isTripActive,
    currentTripRef,
    lastTripSummary,
    warning,
    capability,
    disconnect,
    startTrip,
    stopTrip,
  } = useObdConnection(vehicleId, vehicleName);

  async function handleDisconnect() {
    Alert.alert(t('obd.disconnect_title'), t('obd.disconnect_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('obd.disconnect_title'),
        style: 'destructive',
        onPress: async () => {
          await disconnect();
          navigation.goBack();
        },
      },
    ]);
  }

  // Xuất log thô lệnh/response của phiên (JSON) qua Share sheet - user gửi cho chính mình
  // (Zalo/email/Drive) rồi thả vào repo notedri-app/obd-fixtures/ làm fixture test parser.
  async function handleExportLog() {
    const log = bleService.getSessionLog();
    if (log.length === 0) {
      Alert.alert(t('obd.export_log'), t('obd.export_log_empty'));
      return;
    }
    await Share.share({
      title: 'notedri-obd-session.json',
      message: JSON.stringify(
        { exported_at: new Date().toISOString(), device: deviceName, entries: log },
        null,
        1,
      ),
    });
  }

  const snap = liveSnapshot;
  const isConnected = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting';

  // Badge chất lượng kết nối (ý #16): chỉ hiện khi có vấn đề, sóng tốt thì im lặng
  const [linkQuality, setLinkQuality] = useState<LinkQuality>('unknown');
  useEffect(() => {
    if (!isConnected) { setLinkQuality('unknown'); return; }
    const timer = setInterval(() => setLinkQuality(bleService.getLinkQuality()), 5000);
    return () => clearInterval(timer);
  }, [isConnected]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>{t('obd.dashboard_title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{deviceName}</Text>
        </View>
        <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
          <FontAwesome5 name="times" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Connection status */}
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isConnected ? '#22C55E22' : isReconnecting ? '#F59E0B22' : '#EF444422' },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? '#22C55E' : isReconnecting ? '#F59E0B' : '#EF4444' },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: isConnected ? '#22C55E' : isReconnecting ? '#F59E0B' : '#EF4444' },
            ]}
          >
            {isConnected
              ? t('obd.connected')
              : isReconnecting
              ? t('obd.reconnecting')
              : t('obd.disconnected')}
          </Text>
          {isConnected && (linkQuality === 'fair' || linkQuality === 'poor') && (
            <Text
              style={[
                styles.statusText,
                { color: linkQuality === 'poor' ? '#EF4444' : '#F59E0B', marginLeft: 8 },
              ]}
            >
              {t(linkQuality === 'poor' ? 'obd.link_poor' : 'obd.link_fair')}
            </Text>
          )}
        </View>

        {/* Giải thích back ≠ ngắt (C5): user không còn phải đoán 2 nút thoát khác nhau */}
        {isConnected && (
          <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: -8 }}>
            {t('obd.leave_hint')}
          </Text>
        )}

        {/* No-data warning: adapter connected but ECU not responding */}
        {warning?.type === 'no_data' && (
          <View style={styles.warningBanner}>
            <FontAwesome5 name="exclamation-triangle" size={13} color="#FEF3C7" solid />
            <View style={{ flex: 1 }}>
              <Text style={styles.warningText}>{t('obd.no_data_warning')}</Text>
              {warning.rawResponse ? (
                <Text style={[styles.warningText, { fontSize: 10, opacity: 0.65, marginTop: 4 }]}>
                  Raw: {warning.rawResponse.replace(/[\r\n]+/g, ' ').trim().slice(0, 60)}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Live stats grid - ẩn ô của PID xe không hỗ trợ (capability R8).
            Chưa dò được capability (null) thì hiện đủ như cũ. */}
        <View style={styles.statsGrid}>
          {(() => {
            const tiles = [
              { pid: '0D', el: <StatBox key="0D" label={t('obd.stat_speed')} value={snap?.speedKmh ?? null} unit=" km/h" icon="tachometer-alt" color="#3B82F6" /> },
              { pid: '0C', el: <StatBox key="0C" label="RPM" value={snap?.rpm !== null ? Math.round(snap?.rpm ?? 0) : null} icon="cogs" color="#8B5CF6" /> },
              { pid: '04', el: <StatBox key="04" label={t('obd.stat_engine_load')} value={snap?.engineLoadPct ?? null} unit="%" icon="fire" color="#F59E0B" /> },
              { pid: '05', el: <StatBox key="05" label={t('obd.stat_coolant')} value={snap?.coolantTempC ?? null} unit="°C" icon="thermometer-half" color="#EF4444" /> },
              { pid: '2F', el: <StatBox key="2F" label={t('obd.stat_fuel')} value={snap?.fuelLevelPct ?? null} unit="%" icon="gas-pump" color="#10B981" /> },
              { pid: '5C', el: <StatBox key="5C" label={t('obd.stat_oil_temp')} value={snap?.oilTempC ?? null} unit="°C" icon="oil-can" color="#F97316" /> },
            ];
            const supported = capability
              ? tiles.filter((tile) => capability.supportedPids.includes(tile.pid))
              : tiles;
            const rows = [];
            for (let i = 0; i < supported.length; i += 2) {
              rows.push(
                <View key={i} style={styles.statsRow}>
                  {supported.slice(i, i + 2).map((tile) => tile.el)}
                </View>,
              );
            }
            return rows;
          })()}
        </View>

        {/* Trip history link */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('OBDTrips', { vehicleId, vehicleName, consumptionOfficial })}>
          <FontAwesome5 name="route" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.trip_history')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* NFC pairing link - chỉ hiện khi đang thực sự kết nối, tránh bấm vào im
            lặng không phản hồi nếu xe vừa mất kết nối giữa chừng */}
        {isConnected && (
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => {
            const bleDeviceId = bleService.getDeviceId();
            if (!bleDeviceId) return;
            navigation.navigate('NfcSetup', { vehicleId, vehicleName, bleDeviceId });
          }}>
          <FontAwesome5 name="wifi" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('nfc.pair_link')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
        )}

        {/* Session log export - nguồn fixture cho việc phát triển parser/capability profile */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={handleExportLog}>
          <FontAwesome5 name="file-export" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.export_log')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Trip control */}
        <View style={[styles.tripCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.tripTitle, { color: colors.text }]}>{t('obd.trip_title')}</Text>
          {isTripActive && currentTripRef.current && (
            <Text style={[styles.tripKm, { color: '#3B82F6' }]}>
              {currentTripRef.current.getCurrentDistanceKm()} km
            </Text>
          )}
          {!isTripActive && lastTripSummary && (
            <View style={styles.tripSummary}>
              <Text style={[styles.tripSummaryText, { color: colors.textSecondary }]}>
                {t('obd.trip_last', { dist: lastTripSummary.distanceKm, speed: lastTripSummary.avgSpeedKmh })}
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.tripBtn,
              { backgroundColor: isTripActive ? '#EF4444' : '#3B82F6' },
            ]}
            onPress={isTripActive ? stopTrip : startTrip}
            disabled={!isConnected}
          >
            <FontAwesome5
              name={isTripActive ? 'stop' : 'play'}
              size={14}
              color="#fff"
            />
            <Text style={styles.tripBtnText}>
              {isTripActive ? t('obd.trip_end') : t('obd.trip_start')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  disconnectBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center' },
  body: { padding: 16, gap: 16 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  statsGrid: { gap: 8 },
  statsRow: { flexDirection: 'row', gap: 8 },
  tripCard: { borderRadius: 12, padding: 16, gap: 10 },
  tripTitle: { fontSize: 16, fontWeight: '600' },
  tripKm: { fontSize: 32, fontWeight: '700' },
  tripSummary: {},
  tripSummaryText: { fontSize: 13 },
  tripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#78350F',
    borderRadius: 10,
    padding: 12,
  },
  warningText: { color: '#FEF3C7', fontSize: 13, flex: 1, lineHeight: 18 },
  tripBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyBtnText: { flex: 1, fontWeight: '600', fontSize: 14 },
});
