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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useObdConnection } from '../../hooks/useObd';
import { bleService, LinkQuality } from '../../services/obd/BleService';
import { findingCostLabel } from '../../services/obd/findingCost';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

// Rà soát 16/7 (góp ý user: giảm thao tác lúc lên xe - "1 chạm là kết nối"):
// NFC tap-to-connect đã có sẵn (NfcSetupScreen) nhưng chỉ nằm ở 1 link nhỏ, ít
// ai tự tìm ra. Nhắc NGAY sau lần kết nối Bluetooth thành công đầu tiên/xe -
// đúng lúc user vừa trải nghiệm sự bất tiện của việc bấm quét+chọn thiết bị,
// nên dễ thấy giá trị của "lần sau chỉ cần chạm thẻ". Chỉ nhắc 1 LẦN/xe (không
// biết chắc user đã ghép thẻ thật hay chưa - viết thẻ NFC là hành động vật lý
// ở đầu đọc riêng, không có cách nào server/app tự xác nhận - nhắc lặp lại mỗi
// lần kết nối sẽ gây phiền hơn là hữu ích).
function nfcNudgeKey(vehicleId: number): string {
  return `obd_nfc_nudge_shown_${vehicleId}`;
}

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
    findings,
    warning,
    capability,
    vinMismatch,
    disconnect,
  } = useObdConnection(vehicleId, vehicleName);

  async function handleDisconnect() {
    Alert.alert(t('obd.disconnect_title'), t('obd.disconnect_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('obd.disconnect_title'),
        style: 'destructive',
        onPress: async () => {
          await disconnect().catch(() => {});
          // suppressAutoConnect: user vừa CHỦ ĐỘNG ngắt - không để màn Setup
          // quét thấy thiết bị đã ghép rồi tự nối lại ngay (vòng lặp ngắt-nối)
          navigation.replace('OBDSetup', {
            vehicleId,
            vehicleName,
            consumptionOfficial,
            suppressAutoConnect: true,
          });
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

  // Nhắc ghép thẻ NFC (rà soát 16/7) - xem comment nfcNudgeKey() ở đầu file.
  useEffect(() => {
    if (!isConnected || !vehicleId) return;
    let cancelled = false;
    (async () => {
      const key = nfcNudgeKey(vehicleId);
      const shown = await AsyncStorage.getItem(key);
      if (shown || cancelled) return;
      await AsyncStorage.setItem(key, '1');
      Alert.alert(
        t('nfc.connect_nudge_title'),
        t('nfc.connect_nudge_body'),
        [
          { text: t('gps_trips.later'), style: 'cancel' },
          {
            text: t('nfc.connect_nudge_cta'),
            onPress: () => {
              const bleDeviceId = bleService.getDeviceId();
              if (bleDeviceId) navigation.navigate('NfcSetup', { vehicleId, vehicleName, bleDeviceId });
            },
          },
        ],
      );
    })();
    return () => { cancelled = true; };
  }, [isConnected, vehicleId]);

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

        {/* Rà soát 16/7 (góp ý user: quá nhiều text trước khi thấy số liệu) - số
            liệu sống lên NGAY sau trạng thái kết nối, mọi banner cảnh báo/chẩn
            đoán (VIN lệch, no-data, mọi thứ ổn, findings, tạm dừng) đẩy XUỐNG
            dưới lưới số - đúng kỳ vọng "dashboard" là thấy đồng hồ trước, đọc
            chẩn đoán chi tiết sau nếu cần, không phải ngược lại. */}

        {/* Live stats grid - ẩn ô của PID xe không hỗ trợ (capability R8).
            Chưa dò được capability (null) thì hiện đủ như cũ. Mờ đi khi số liệu
            không còn cập nhật (mất sóng) để phân biệt với dữ liệu sống. */}
        <View style={[styles.statsGrid, !isConnected && snap ? { opacity: 0.5 } : null]}>
          {(() => {
            const tiles = [
              { pid: '0D', el: <StatBox key="0D" label={t('obd.stat_speed')} value={snap?.speedKmh ?? null} unit=" km/h" icon="tachometer-alt" color="#3B82F6" /> },
              { pid: '0C', el: <StatBox key="0C" label="RPM" value={snap?.rpm !== null ? Math.round(snap?.rpm ?? 0) : null} icon="cogs" color="#8B5CF6" /> },
              { pid: '04', el: <StatBox key="04" label={t('obd.stat_engine_load')} value={snap?.engineLoadPct ?? null} unit="%" icon="fire" color="#F59E0B" /> },
              { pid: '05', el: <StatBox key="05" label={t('obd.stat_coolant')} value={snap?.coolantTempC ?? null} unit="°C" icon="thermometer-half" color="#EF4444" /> },
              { pid: '2F', el: <StatBox key="2F" label={t('obd.stat_fuel')} value={snap?.fuelLevelPct ?? null} unit="%" icon="gas-pump" color="#10B981" /> },
              { pid: '5C', el: <StatBox key="5C" label={t('obd.stat_oil_temp')} value={snap?.oilTempC ?? null} unit="°C" icon="oil-can" color="#F97316" /> },
              { pid: '11', el: <StatBox key="11" label={t('obd.stat_throttle')} value={snap?.throttlePct ?? null} unit="%" icon="sliders-h" color="#14B8A6" /> },
              { pid: '42', el: <StatBox key="42" label={t('obd.stat_voltage')} value={snap?.controlModuleVoltage ?? null} unit="V" icon="battery-full" color="#6366F1" /> },
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

        {/* VIN không khớp: có thể đang cắm Vgate sang XE KHÁC vào bản ghi này
            (toàn vẹn dữ liệu, Sang duyệt 14/7). Chỉ cảnh báo, không chặn. */}
        {vinMismatch && (
          <View style={[styles.warningBanner, { backgroundColor: '#B45309' }]}>
            <FontAwesome5 name="car-crash" size={13} color="#FEF3C7" solid />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningText, { fontWeight: '700' }]}>
                {t('obd.vin_mismatch_title', { name: vehicleName || 'xe này' })}
              </Text>
              <Text style={[styles.warningText, { fontSize: 11, opacity: 0.9, marginTop: 2 }]}>
                {t('obd.vin_mismatch_desc')}
              </Text>
            </View>
          </View>
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

        {/* Trạng thái "mọi chỉ số bình thường" khi ĐANG kết nối + không có
            cảnh báo nào (rà soát 14/7: trước đây 0 finding hiển thị y như "chưa
            tải xong" - user không phân biệt được xe khoẻ với app treo). */}
        {isConnected && findings.length === 0 && warning?.type !== 'no_data' && snap && (
          <View style={[styles.warningBanner, { backgroundColor: '#16653422' }]}>
            <FontAwesome5 name="check-circle" size={14} color="#22C55E" solid />
            <Text style={[styles.warningText, { color: '#22C55E', fontWeight: '600' }]}>
              {t('obd.live_all_good')}
            </Text>
          </View>
        )}

        {/* Cảnh báo từ Diagnostic Engine (rule beta có nguồn dẫn) - hiện khi
            evaluate() bắt được bất thường trên snapshot sống */}
        {findings.map((f) => {
          const cost = findingCostLabel(f.related_dtc);
          return (
          <View
            key={f.ruleId}
            style={[
              styles.warningBanner,
              { backgroundColor: f.severity === 'critical' ? '#B91C1C' : '#B45309' },
            ]}>
            <FontAwesome5
              name={f.can_drive === 'stop' ? 'hand-paper' : 'exclamation-triangle'}
              size={13}
              color="#FEF3C7"
              solid
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.warningText, { fontWeight: '700' }]}>
                {f.title_vi}{f.beta ? ` (${t('obd.finding_beta')})` : ''}
              </Text>
              <Text style={[styles.warningText, { fontSize: 11, opacity: 0.9, marginTop: 2 }]}>
                {f.action_vi}
              </Text>
              {cost && (
                <Text style={[styles.warningText, { fontSize: 11, opacity: 0.85, marginTop: 3, fontStyle: 'italic' }]}>
                  {t('obd.finding_cost', { range: cost })}
                </Text>
              )}
            </View>
          </View>
          );
        })}

        {/* Dấu "số liệu đang tạm dừng cập nhật" khi mất sóng/đang nối lại
            (rà soát 14/7: trước đây các ô vẫn hiện số CŨ y như đang live -
            tài xế liếc màn hình tưởng là số thật lúc này). */}
        {!isConnected && snap && (
          <View style={[styles.warningBanner, { backgroundColor: '#78716C22' }]}>
            <FontAwesome5 name="pause-circle" size={13} color="#A8A29E" solid />
            <Text style={[styles.warningText, { color: '#A8A29E', fontSize: 12 }]}>
              {t('obd.data_paused')}
            </Text>
          </View>
        )}

        <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>{t('obd.live_data_title')}</Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {t('obd.live_data_subtitle')}
          </Text>
          <View style={{ gap: 6, marginTop: 10 }}>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_speed')}
            </Text>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_rpm')}
            </Text>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_temp')}
            </Text>
            <Text style={[styles.infoBullet, { color: colors.textSecondary }]}>
              {t('obd.live_data_item_voltage')}
            </Text>
          </View>
        </View>

        {/* Sức khoẻ theo hệ thống (C4): gom findings + số liệu sống theo hệ
            (Động cơ/Làm mát/Điện/Nhiên liệu) - xem nhanh, không chấm điểm. */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('ObdSystemHealth', { vehicleId, vehicleName })}>
          <FontAwesome5 name="heartbeat" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.sys_health_link')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Trang kỹ thuật: xem hết 13 PID (kể cả 5 PID chưa hiện ở grid trên) -
            dành cho user muốn xem số liệu thô, không giới hạn Premium (đã ở
            trong khu vực Premium-gated OBD rồi). */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('OBDTechnical', { vehicleId })}>
          <FontAwesome5 name="table" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.tech_link')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

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

        {/* Quyết định 14/7: GPS là nguồn chuyến duy nhất (fixture #5: JS timer bị
            đóng băng ở nền → quãng đường OBD sai). OBD chỉ còn live view + DTC. */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('GpsTrips', { vehicleId, vehicleName })}>
          <FontAwesome5 name="satellite-dish" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.trips_via_gps')}</Text>
          <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
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
  infoCard: {
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  infoTitle: { fontSize: 15, fontWeight: '700' },
  infoText: { fontSize: 12.5, lineHeight: 18 },
  infoBullet: { fontSize: 12, lineHeight: 18 },
});
