import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';
import { bleService } from '../../services/obd/BleService';
import { readExtendedSnapshot, readBatteryVoltageDirect, ObdSnapshot, ObdExtendedSnapshot } from '../../services/obd/ObdReader';
import { obdLiveMonitor } from '../../services/obd/obdLiveMonitor';
import { getCachedCapability, getSessionVin, readCalibrationId, readCvn } from '../../services/obd/capabilityService';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors, ColorPalette } from '../../utils/theme';
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
  { pid: '07', nameKey: 'obd.stat_fuel_trim_long', unit: '%', read: (_s, e) => e?.fuelTrimLongB1Pct ?? null },
  { pid: '14', nameKey: 'obd.stat_o2_voltage', unit: ' V', read: (_s, e) => e?.o2SensorB1S1Voltage ?? null },
  { pid: '33', nameKey: 'obd.stat_barometric', unit: ' kPa', read: (_s, e) => e?.barometricPressureKpa ?? null },
];

const SAMPLE_INTERVAL_MS = 1000;
const MAX_SAMPLES = 120; // ~2 phút

type Sample = { t: number; v: number };

// Ngưỡng điện áp ắc quy tiêu chuẩn ngành ô tô, áp dụng được cả lúc máy nổ (đang
// sạc, thường 13.2-14.7V) lẫn lúc tắt máy (nghỉ, 12.4-12.8V là bình thường):
// <12.0V = yếu/cần chú ý, 12.0-13.2V = bình thường, >=13.2V = tốt (đang sạc/mới).
function classifyVoltage(v: number): { labelKey: 'obd.battery_status_good' | 'obd.battery_status_average' | 'obd.battery_status_weak'; tone: 'success' | 'warning' | 'error' } {
  if (v < 12.0) return { labelKey: 'obd.battery_status_weak', tone: 'error' };
  if (v < 13.2) return { labelKey: 'obd.battery_status_average', tone: 'warning' };
  return { labelKey: 'obd.battery_status_good', tone: 'success' };
}

export default function OBDTechnicalScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const t = useT();
  const colors = useColors();

  const [snapshot, setSnapshot] = useState<ObdSnapshot | null>(null);
  const [extended, setExtended] = useState<ObdExtendedSnapshot | null>(null);
  const [supportedPids, setSupportedPids] = useState<Set<string> | null>(null);
  const [batterySamples, setBatterySamples] = useState<Sample[]>([]);
  const [calibrationId, setCalibrationId] = useState<string | null>(null);
  const [cvn, setCvn] = useState<string | null>(null);
  const isConnected = bleService.isConnected();
  const pollInFlight = useRef(false);
  const batteryInFlight = useRef(false);
  const batteryStartRef = useRef<number>(Date.now());
  const vin = getSessionVin();

  useEffect(() => {
    getCachedCapability(vehicleId)
      .then((cap) => setSupportedPids(cap ? new Set(cap.supportedPids.map((p) => p.toUpperCase())) : null))
      .catch(() => {});
  }, [vehicleId]);

  // Calibration ID + CVN (18/8, mode 09 PID 04/06) - đọc 1 lần, cache theo
  // phiên trong capabilityService.ts (giống VIN) nên gọi lại khi remount
  // KHÔNG gửi lệnh lặp nếu đã đọc trong cùng phiên BLE.
  useEffect(() => {
    if (!isConnected) return;
    readCalibrationId().then(setCalibrationId).catch(() => {});
    readCvn().then(setCvn).catch(() => {});
  }, [isConnected]);

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

  // Điện áp ắc quy qua ATRV (16/8, gộp từ màn "Kiểm tra ắc quy" riêng trước đó -
  // rà soát UX: màn đó vẫn cần kết nối như mọi thứ ở đây, không cần tách route
  // riêng). Không qua ECU nên vẫn lấy mẫu được kể cả khi PID mode 01 không có data.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;

    async function poll() {
      if (batteryInFlight.current) return;
      batteryInFlight.current = true;
      try {
        const v = await readBatteryVoltageDirect();
        if (!cancelled && v !== null) {
          setBatterySamples((prev) => {
            const next = [...prev, { t: Date.now() - batteryStartRef.current, v }];
            return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
          });
        }
      } catch {
        // Lấy mẫu lỗi thoáng qua - bỏ qua, vòng sau thử lại.
      } finally {
        batteryInFlight.current = false;
      }
    }

    poll();
    const timer = setInterval(poll, SAMPLE_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [isConnected]);

  const batteryValues = batterySamples.map((s) => s.v);
  const batteryCurrent = batteryValues.length ? batteryValues[batteryValues.length - 1] : null;
  const batteryMax = batteryValues.length ? Math.max(...batteryValues) : null;
  const batteryMin = batteryValues.length ? Math.min(...batteryValues) : null;
  const batteryStatus = batteryCurrent !== null ? classifyVoltage(batteryCurrent) : null;
  const batteryStatusColor = batteryStatus ? colors[batteryStatus.tone] : colors.textSecondary;

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

        {isConnected && (vin || calibrationId || cvn) && (
          <View style={[styles.table, { backgroundColor: colors.card }]}>
            <View style={[styles.row, styles.headerRow, { borderColor: colors.border }]}>
              <Text style={[styles.headCell, { color: colors.textSecondary }]}>{t('obd.vehicle_info_title')}</Text>
            </View>
            {vin && (
              <View style={[styles.infoRow, { borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('obd.vehicle_info_vin')}</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{vin}</Text>
              </View>
            )}
            {calibrationId && (
              <View style={[styles.infoRow, { borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('obd.vehicle_info_cid')}</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{calibrationId}</Text>
              </View>
            )}
            {cvn && (
              <View style={[styles.infoRow, { borderColor: colors.border }]}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('obd.vehicle_info_cvn')}</Text>
                <Text style={[styles.infoValue, { color: colors.text }]}>{cvn}</Text>
              </View>
            )}
          </View>
        )}

        {isConnected && (
          <View style={{ gap: 10 }}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('obd.battery_test_title')}</Text>

            {batteryStatus && (
              <View style={[styles.statusBadge, { backgroundColor: batteryStatusColor }]}>
                <FontAwesome5 name="car-battery" size={13} color="#fff" solid />
                <Text style={styles.statusText}>{t(batteryStatus.labelKey)}</Text>
              </View>
            )}

            <View style={styles.statRow}>
              <StatCard label={t('obd.battery_current')} value={batteryCurrent} colors={colors} highlight />
              <StatCard label={t('obd.battery_max')} value={batteryMax} colors={colors} />
              <StatCard label={t('obd.battery_min')} value={batteryMin} colors={colors} />
            </View>

            <VoltageChart samples={batterySamples} colors={colors} sampling={t('obd.battery_sampling')} />
          </View>
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

function StatCard({ label, value, colors, highlight }: { label: string; value: number | null; colors: ColorPalette; highlight?: boolean }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <Text style={[styles.statValue, { color: highlight ? colors.primary : colors.text }]}>
        {value !== null ? `${value.toFixed(2)}V` : '-'}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

const CHART_HEIGHT = 120;
const Y_AXIS_WIDTH = 42;

// Line chart tự vẽ bằng react-native-svg (đã có sẵn trong app qua ArcGauge, không
// thêm thư viện chart mới - cùng quyết định 15/7 đã áp dụng cho ObdTrendChart).
// Trục Y neo theo min/max THẬT của mẫu (không ép về 0) - điện áp dao động hẹp
// (12-15V), ép về 0 sẽ khiến mọi dao động trông phẳng lì, vô nghĩa.
function VoltageChart({ samples, colors, sampling }: { samples: Sample[]; colors: ColorPalette; sampling: string }) {
  const [width, setWidth] = useState(0);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  if (samples.length < 2) {
    return (
      <View style={[styles.chartCard, { backgroundColor: colors.card, height: CHART_HEIGHT + 32, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{sampling}</Text>
      </View>
    );
  }

  const values = samples.map((s) => s.v);
  const vMax = Math.max(...values);
  const vMin = Math.min(...values);
  const pad = Math.max(0.1, (vMax - vMin) * 0.15);
  const scaleMax = vMax + pad;
  const scaleMin = vMin - pad;
  const tMax = samples[samples.length - 1].t || 1;
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);

  const toX = (t: number) => Y_AXIS_WIDTH + (t / tMax) * plotWidth;
  const toY = (v: number) => CHART_HEIGHT - ((v - scaleMin) / (scaleMax - scaleMin)) * CHART_HEIGHT;
  const points = samples.map((s) => `${toX(s.t)},${toY(s.v)}`).join(' ');

  const touched = touchIndex !== null ? samples[touchIndex] : null;
  const nearestIndex = (x: number) => {
    if (plotWidth <= 0) return 0;
    const frac = Math.max(0, Math.min(1, (x - Y_AXIS_WIDTH) / plotWidth));
    return Math.round(frac * (samples.length - 1));
  };

  return (
    <View
      style={[styles.chartCard, { backgroundColor: colors.card }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.chartHeaderRow}>
        <Text style={[styles.chartHeaderValue, { color: colors.text }]}>
          {touched ? `${touched.v.toFixed(2)}V · ${Math.round(touched.t / 1000)}s` : ''}
        </Text>
      </View>

      {width > 0 && (
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => setTouchIndex(nearestIndex(e.nativeEvent.locationX))}
          onResponderMove={(e) => setTouchIndex(nearestIndex(e.nativeEvent.locationX))}
          onResponderRelease={() => setTouchIndex(null)}
        >
          <Svg width={width} height={CHART_HEIGHT}>
            {/* Gridline trên/dưới - mờ, không cạnh tranh với đường dữ liệu */}
            <Line x1={Y_AXIS_WIDTH} y1={1} x2={width} y2={1} stroke={colors.border} strokeWidth={1} />
            <Line x1={Y_AXIS_WIDTH} y1={CHART_HEIGHT - 1} x2={width} y2={CHART_HEIGHT - 1} stroke={colors.border} strokeWidth={1} />
            <Polyline points={points} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {/* Điểm neo tại mẫu mới nhất */}
            <Circle cx={toX(samples[samples.length - 1].t)} cy={toY(samples[samples.length - 1].v)} r={3.5} fill={colors.primary} />
            {touched && (
              <>
                <Line x1={toX(touched.t)} y1={0} x2={toX(touched.t)} y2={CHART_HEIGHT} stroke={colors.textSecondary} strokeWidth={1} opacity={0.5} />
                <Circle cx={toX(touched.t)} cy={toY(touched.v)} r={4} fill={colors.text} />
              </>
            )}
          </Svg>
        </View>
      )}

      <View style={styles.chartAxisRow}>
        <Text style={[styles.chartAxisText, { color: colors.textSecondary }]}>{scaleMin.toFixed(1)}V</Text>
        <Text style={[styles.chartAxisText, { color: colors.textSecondary }]}>{scaleMax.toFixed(1)}V</Text>
      </View>
    </View>
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
  body: { padding: 16, gap: 16 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  notConnected: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  infoLabel: { fontSize: 12.5 },
  infoValue: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', fontFamily: 'monospace', textAlign: 'right' },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 16, fontWeight: '800' },
  statLabel: { fontSize: 11 },
  chartCard: { borderRadius: 12, padding: 14, gap: 8 },
  chartHeaderRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  chartHeaderValue: { fontSize: 13, fontWeight: '700' },
  chartAxisRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: Y_AXIS_WIDTH },
  chartAxisText: { fontSize: 10 },
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
