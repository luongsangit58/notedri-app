import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { bleService } from '../../services/obd/BleService';
import { readExtendedSnapshot, ObdSnapshot, ObdExtendedSnapshot } from '../../services/obd/ObdReader';
import { obdLiveMonitor } from '../../services/obd/obdLiveMonitor';
import { getCachedCapability } from '../../services/obd/capabilityService';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { contentWide } from '../../utils/layout';

// Toàn bộ 13 PID trong PID_REGISTRY (obdParser.ts) - kể cả 5 PID CHƯA từng hiện
// ở đâu trước 14/7 (fuel trim, áp suất khí nạp, nhiệt độ khí nạp, nhiệt độ môi
// trường, tốc độ tiêu hao nhiên liệu). Màn này đọc thêm readExtendedSnapshot()
// RIÊNG với vòng poll 3s của obdLiveMonitor - không kéo dài round-trip BLE của
// live monitor cho dữ liệu vốn ít người cần xem.
type Row = {
  pid: string;
  nameKey: string;
  unit: string;
  read: (snap: ObdSnapshot | null, ext: ObdExtendedSnapshot | null) => number | null;
};

const ROWS: Row[] = [
  { pid: '0C', nameKey: '', unit: ' rpm', read: (s) => s?.rpm ?? null },
  { pid: '0D', nameKey: 'obd.stat_speed', unit: ' km/h', read: (s) => s?.speedKmh ?? null },
  { pid: '04', nameKey: 'obd.stat_engine_load', unit: '%', read: (s) => s?.engineLoadPct ?? null },
  { pid: '05', nameKey: 'obd.stat_coolant', unit: '°C', read: (s) => s?.coolantTempC ?? null },
  { pid: '2F', nameKey: 'obd.stat_fuel', unit: '%', read: (s) => s?.fuelLevelPct ?? null },
  { pid: '5C', nameKey: 'obd.stat_oil_temp', unit: '°C', read: (s) => s?.oilTempC ?? null },
  { pid: '11', nameKey: 'obd.stat_throttle', unit: '%', read: (s) => s?.throttlePct ?? null },
  { pid: '42', nameKey: 'obd.stat_voltage', unit: ' V', read: (s) => s?.controlModuleVoltage ?? null },
  { pid: '06', nameKey: 'obd.stat_fuel_trim', unit: '%', read: (_s, e) => e?.fuelTrimShortB1Pct ?? null },
  { pid: '0B', nameKey: 'obd.stat_intake_pressure', unit: ' kPa', read: (_s, e) => e?.intakeManifoldPressureKpa ?? null },
  { pid: '0F', nameKey: 'obd.stat_intake_temp', unit: '°C', read: (_s, e) => e?.intakeAirTempC ?? null },
  { pid: '46', nameKey: 'obd.stat_ambient_temp', unit: '°C', read: (_s, e) => e?.ambientAirTempC ?? null },
  { pid: '5E', nameKey: 'obd.stat_fuel_rate', unit: ' L/h', read: (_s, e) => e?.fuelRateLPerHour ?? null },
];

export default function OBDTechnicalScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const t = useT();
  const colors = useColors();

  const [snapshot, setSnapshot] = useState<ObdSnapshot | null>(null);
  const [extended, setExtended] = useState<ObdExtendedSnapshot | null>(null);
  const [supportedPids, setSupportedPids] = useState<Set<string> | null>(null);
  const isConnected = bleService.isConnected();
  const pollInFlight = useRef(false);

  useEffect(() => {
    getCachedCapability(vehicleId)
      .then((cap) => setSupportedPids(cap ? new Set(cap.supportedPids.map((p) => p.toUpperCase())) : null))
      .catch(() => {});
  }, [vehicleId]);

  // 6 PID lõi lấy từ obdLiveMonitor (vòng poll 3s sẵn chạy ngầm cả phiên BLE) -
  // KHÔNG tự gọi readSnapshot() nữa: trước 15/7 màn này poll riêng chồng lên vòng
  // của live monitor, log adapter thật cho thấy cùng 1 PID bị hỏi 2 lần cách 60-90ms
  // (2 cờ in-flight độc lập không biết nhau) - tốn round-trip BLE vô ích.
  useEffect(() => {
    if (!isConnected) return;
    return obdLiveMonitor.onSnapshot(setSnapshot);
  }, [isConnected]);

  // Vòng poll riêng CHỈ còn 5 PID mở rộng (fuel trim, áp suất/nhiệt độ khí nạp...)
  // - thứ duy nhất obdLiveMonitor không đọc.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    async function poll() {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        const ext = await readExtendedSnapshot();
        if (!cancelled) setExtended(ext);
      } catch {
        // Poll lỗi thoáng qua - bỏ qua, vòng sau thử lại
      } finally {
        pollInFlight.current = false;
      }
    }

    poll();
    const timer = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isConnected]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.tech_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, contentWide]}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('obd.tech_subtitle')}</Text>

        {!isConnected && (
          <Text style={[styles.notConnected, { color: colors.textSecondary }]}>
            {t('obd.tech_not_connected')}
          </Text>
        )}

        <View style={[styles.table, { backgroundColor: colors.card }]}>
          <View style={[styles.row, styles.headerRow, { borderColor: colors.border }]}>
            <Text style={[styles.cellPid, styles.headCell, { color: colors.textSecondary }]}>{t('obd.tech_col_pid')}</Text>
            <Text style={[styles.cellName, styles.headCell, { color: colors.textSecondary }]}>{t('obd.tech_col_name')}</Text>
            <Text style={[styles.cellValue, styles.headCell, { color: colors.textSecondary }]}>{t('obd.tech_col_value')}</Text>
          </View>
          {ROWS.map((row) => {
            const known = supportedPids ? supportedPids.has(row.pid) : true;
            const value = row.read(snapshot, extended);
            return (
              <View key={row.pid} style={[styles.row, { borderColor: colors.border }]}>
                <Text style={[styles.cellPid, { color: colors.textSecondary }]}>{row.pid}</Text>
                <Text style={[styles.cellName, { color: colors.text }]}>
                  {row.nameKey ? t(row.nameKey as Parameters<typeof t>[0]) : 'RPM'}
                </Text>
                <Text style={[styles.cellValue, { color: colors.text, fontWeight: '700' }]}>
                  {!known ? (
                    <Text style={{ color: colors.textSecondary, fontWeight: '400', fontSize: 11 }}>
                      {t('obd.tech_unsupported')}
                    </Text>
                  ) : value !== null ? `${value}${row.unit}` : '-'}
                </Text>
              </View>
            );
          })}
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
  title: { fontSize: 18, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  notConnected: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  table: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: { paddingVertical: 8 },
  headCell: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cellPid: { width: 44, fontSize: 13, fontFamily: 'monospace' },
  cellName: { flex: 1, fontSize: 13.5 },
  cellValue: { width: 90, fontSize: 14, textAlign: 'right' },
});
