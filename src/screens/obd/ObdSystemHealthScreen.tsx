import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useObdConnection } from '../../hooks/useObd';
import { vehiclesApi } from '../../api/vehicles';
import { scoreColor, scoreBand } from '../../utils/healthScore';
import { findingCostLabel } from '../../services/obd/findingCost';
import {
  buildSystemHealth,
  overallSystemStatus,
  SystemHealth,
  SystemStatus,
  SystemReading,
} from '../../services/obd/systemHealth';
import { obdLiveMonitor } from '../../services/obd/obdLiveMonitor';
import { readReadinessStatus, DtcCode, ObdSnapshot, FreezeFrameSnapshot } from '../../services/obd/ObdReader';
import { ReadinessStatus } from '../../services/obd/obdParser';
import { lookupDtcOffline } from '../../services/obd/dtcOfflineDictionary';
import { useObdAutoConnectSettingsStore } from '../../store/obdAutoConnectSettingsStore';
import { classifyCoolantTemp, classifyRunningVoltage, classifyIdleRpm, ReadingClassification } from '../../services/obd/readingThresholds';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { contentWide } from '../../utils/layout';

const STATUS_COLOR: Record<SystemStatus, string> = {
  critical: '#EF4444',
  warn: '#F59E0B',
  ok: '#22C55E',
  na: '#9CA3AF',
};

const STATUS_ICON: Record<SystemStatus, string> = {
  critical: 'exclamation-circle',
  warn: 'exclamation-triangle',
  ok: 'check-circle',
  na: 'minus-circle',
};

const SYSTEM_ICON: Record<SystemHealth['key'], string> = {
  engine: 'cogs',
  cooling: 'thermometer-half',
  electrical: 'car-battery',
  fuel: 'gas-pump',
};

// Màu cho ReadingClassification (readingThresholds.ts) - 'info' KHÔNG có trong
// SystemStatus (STATUS_COLOR ở trên) vì "đang làm nóng máy" không phải trạng
// thái xấu/tốt, chỉ là thông tin trung tính (dùng luôn cùng tông màu na/N-A).
const LEVEL_COLOR: Record<ReadingClassification['level'], string> = {
  ...STATUS_COLOR,
  info: '#3B82F6',
};

// Định dạng giá trị số liệu: rpm làm tròn, còn lại giữ như đọc (điện áp có phần
// thập phân, % là số nguyên sẵn) - không tự bịa độ chính xác thừa.
function formatReading(r: SystemReading): string {
  const v = r.key === 'rpm' ? Math.round(r.value) : r.value;
  return `${v}${r.unit ? (r.unit === '°C' || r.unit === 'V' ? r.unit : ` ${r.unit}`) : ''}`;
}

/**
 * Phân loại "bình thường/bất thường" cho ĐÚNG 3 chỉ số có ngưỡng đáng tin cậy
 * (xem readingThresholds.ts) - load/throttle/fuel KHÔNG có ngưỡng cố định (phụ
 * thuộc cách lái/mức xăng còn lại thuần thông tin), cố tình để trống thay vì
 * bịa ngưỡng vô nghĩa. Cần snapshot đầy đủ để biết NGỮ CẢNH: điện áp chỉ đánh
 * giá được khi chắc chắn máy đang nổ (rpm), rpm không tải chỉ đánh giá được
 * khi xe đứng yên (speedKmh) - sai ngữ cảnh thì bỏ qua, không phán xét liều.
 */
function classifyForCard(r: SystemReading, snap: ObdSnapshot | null): ReadingClassification | null {
  if (r.key === 'coolant') return classifyCoolantTemp(r.value);
  if (r.key === 'voltage') {
    if (snap?.rpm !== null && snap?.rpm !== undefined && snap.rpm >= 400) return classifyRunningVoltage(r.value);
    return null;
  }
  if (r.key === 'rpm') {
    if (snap?.speedKmh === 0) return classifyIdleRpm(r.value, snap.coolantTempC);
    return null;
  }
  return null;
}

function SystemCard({ sys, snapshot }: { sys: SystemHealth; snapshot: ObdSnapshot | null }) {
  const colors = useColors();
  const t = useT();
  const clr = STATUS_COLOR[sys.status];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: clr }]}>
      <View style={styles.cardHeader}>
        <FontAwesome5 name={SYSTEM_ICON[sys.key]} size={15} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t(`obd.sys_${sys.key}` as any)}</Text>
        <View style={[styles.statusPill, { backgroundColor: clr + '22' }]}>
          <FontAwesome5 name={STATUS_ICON[sys.status]} size={11} color={clr} solid />
          <Text style={[styles.statusPillText, { color: clr }]}>
            {t(`obd.sys_status_${sys.status}` as any)}
          </Text>
        </View>
      </View>

      {/* Số liệu sống của hệ - chạm vào 1 ô để xem khoảng tham chiếu + giải
          thích ý nghĩa (chỉ 3 chỉ số có ngưỡng mới hiện được nhãn màu +
          chạm được, xem classifyForCard()). */}
      {sys.readings.length > 0 && (
        <View style={styles.readingsRow}>
          {sys.readings.map((r) => {
            const cls = classifyForCard(r, snapshot);
            const Wrapper = cls ? TouchableOpacity : View;
            return (
              <Wrapper
                key={r.key}
                style={styles.reading}
                {...(cls ? {
                  onPress: () => Alert.alert(t(`obd.sys_reading_${r.key}` as any), t(cls.explainKey as any)),
                } : {})}
              >
                <Text style={[styles.readingValue, { color: colors.text }]}>{formatReading(r)}</Text>
                <Text style={[styles.readingLabel, { color: colors.textSecondary }]}>
                  {t(`obd.sys_reading_${r.key}` as any)}
                </Text>
                {cls && (
                  <Text style={[styles.readingRange, { color: LEVEL_COLOR[cls.level] }]}>
                    {t(cls.labelKey as any)}
                  </Text>
                )}
              </Wrapper>
            );
          })}
        </View>
      )}

      {/* Cảnh báo thuộc hệ (findings) */}
      {sys.findings.map((f) => {
        const cost = findingCostLabel(f.related_dtc);
        return (
          <View key={f.ruleId} style={[styles.findingRow, { borderTopColor: colors.border }]}>
            <FontAwesome5
              name={f.can_drive === 'stop' ? 'hand-paper' : 'exclamation-triangle'}
              size={12}
              color={STATUS_COLOR[f.severity === 'critical' ? 'critical' : 'warn']}
              solid
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.findingTitle, { color: colors.text }]}>
                {f.title_vi}{f.beta ? ` (${t('obd.finding_beta')})` : ''}
              </Text>
              <Text style={[styles.findingAction, { color: colors.textSecondary }]}>{f.action_vi}</Text>
              {cost && (
                <Text style={[styles.findingCost, { color: colors.textSecondary }]}>
                  {t('obd.finding_cost', { range: cost })}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Định dạng freeze frame (mode 02 - thông số ECU chụp ĐÚNG lúc mã lỗi mode 03
 * được ghi nhận) thành text nhiều dòng cho Alert.alert. Chỉ liệt kê trường có
 * dữ liệu - ECU không phải lúc nào cũng trả đủ 6 trường (tuỳ hãng/PID hỗ trợ).
 */
function formatFreezeFrame(ff: FreezeFrameSnapshot, t: ReturnType<typeof useT>): string {
  const lines: string[] = [];
  if (ff.rpm !== null) lines.push(`${t('obd.sys_reading_rpm')}: ${Math.round(ff.rpm)} rpm`);
  if (ff.speedKmh !== null) lines.push(`${t('obd.stat_speed')}: ${ff.speedKmh} km/h`);
  if (ff.coolantTempC !== null) lines.push(`${t('obd.sys_reading_coolant')}: ${ff.coolantTempC}°C`);
  if (ff.engineLoadPct !== null) lines.push(`${t('obd.sys_reading_load')}: ${ff.engineLoadPct}%`);
  if (ff.fuelTrimShortB1Pct !== null) lines.push(`${t('obd.stat_fuel_trim')}: ${ff.fuelTrimShortB1Pct}%`);
  if (ff.controlModuleVoltage !== null) lines.push(`${t('obd.sys_reading_voltage')}: ${ff.controlModuleVoltage}V`);
  return lines.length > 0 ? lines.join('\n') : t('obd.freeze_frame_empty');
}

/**
 * Báo cáo dạng text (Share API) cho kết quả 1 lần quét - khác "Xuất log phiên"
 * ở OBDSetupScreen (log kỹ thuật thô cho gỡ lỗi): đây là bản NGƯỜI ĐỌC ĐƯỢC,
 * dành để gửi thợ/người thân, dùng lại đúng nhãn hiển thị trên màn hình.
 */
function buildScanReport(params: {
  t: ReturnType<typeof useT>;
  vehicleName: string;
  overall: SystemStatus;
  priorityAdvice: string;
  confirmed: DtcCode[];
  pending: DtcCode[];
  permanent: DtcCode[];
  readiness: ReadinessStatus | null;
  systems: SystemHealth[];
}): string {
  const { t, vehicleName, overall, priorityAdvice, confirmed, pending, permanent, readiness, systems } = params;
  const lines: string[] = [];
  lines.push(`NoteDri — ${t('obd.dtc_card_title')}${vehicleName ? `: ${vehicleName}` : ''}`);
  lines.push(new Date().toLocaleString());
  lines.push('');
  lines.push(`${t('obd.sys_overall')}: ${t(`obd.sys_status_${overall}` as any)}`);
  lines.push(priorityAdvice);
  lines.push('');

  lines.push(t('obd.dtc_card_title').toUpperCase());
  if (confirmed.length === 0 && pending.length === 0 && permanent.length === 0) {
    lines.push(t('obd.dtc_none'));
  } else {
    const dtcLine = (c: DtcCode) => {
      const info = lookupDtcOffline(c.code);
      return `- ${c.code}${info.known ? ` — ${info.title_vi}` : ''}`;
    };
    if (confirmed.length > 0) {
      lines.push(`${t('obd.dtc_confirmed')}:`, ...confirmed.map(dtcLine));
    }
    if (pending.length > 0) {
      lines.push(`${t('obd.dtc_pending')}:`, ...pending.map((c) => `- ${c.code}`));
    }
    if (permanent.length > 0) {
      lines.push(`${t('obd.dtc_permanent')}:`, ...permanent.map(dtcLine));
    }
  }
  lines.push('');

  lines.push(t('obd.readiness_title').toUpperCase());
  if (readiness) {
    lines.push(readiness.milOn ? t('obd.readiness_mil_on') : t('obd.readiness_mil_off'));
    readiness.monitors.forEach((m) => {
      const stateLabel = !m.supported ? t('obd.readiness_status_na')
        : m.ready ? t('obd.readiness_status_ready') : t('obd.readiness_status_not_ready');
      lines.push(`- ${t(`obd.readiness_monitor_${m.key}` as any)}: ${stateLabel}`);
    });
  } else {
    lines.push(t('obd.readiness_not_available'));
  }
  lines.push('');

  lines.push(t('obd.sys_health_title').toUpperCase());
  systems.forEach((sys) => {
    const readingsText = sys.readings.map((r) => formatReading(r)).join(', ');
    lines.push(`- ${t(`obd.sys_${sys.key}` as any)}: ${t(`obd.sys_status_${sys.status}` as any)}${readingsText ? ` (${readingsText})` : ''}`);
  });

  lines.push('');
  lines.push(t('obd.share_footer'));
  return lines.join('\n');
}

function useDtcState() {
  const [confirmed, setConfirmed] = useState<DtcCode[]>(() => obdLiveMonitor.getLastConfirmedDtc());
  const [pending, setPending] = useState<DtcCode[]>(() => obdLiveMonitor.getLastPendingDtc());
  const [permanent, setPermanent] = useState<DtcCode[]>(() => obdLiveMonitor.getLastPermanentDtc());

  useEffect(() => {
    const offConfirmed = obdLiveMonitor.onDtcFound(setConfirmed);
    const offPending = obdLiveMonitor.onPendingDtcFound(setPending);
    const offPermanent = obdLiveMonitor.onPermanentDtcFound(setPermanent);
    return () => {
      offConfirmed();
      offPending();
      offPermanent();
    };
  }, []);

  return { confirmed, pending, permanent };
}

function DtcCard({ isConnected, onCleared }: { isConnected: boolean; onCleared: () => void }) {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const { confirmed, pending, permanent } = useDtcState();
  const [clearing, setClearing] = useState(false);

  // Freeze frame (mode 02) - chụp RIÊNG, chạy SAU khi mã đã hiện ở trên (xem
  // comment onFreezeFrameCaptured() ở obdLiveMonitor.ts) nên seed từ getter cho
  // mã đã chụp xong trước khi mount + subscribe nghe mã chụp XONG sau đó.
  const [freezeFrames, setFreezeFrames] = useState<Record<string, FreezeFrameSnapshot>>({});
  useEffect(() => {
    const seeded: Record<string, FreezeFrameSnapshot> = {};
    for (const c of confirmed) {
      const ff = obdLiveMonitor.getFreezeFrame(c.code);
      if (ff) seeded[c.code] = ff;
    }
    if (Object.keys(seeded).length > 0) setFreezeFrames((prev) => ({ ...seeded, ...prev }));
    return obdLiveMonitor.onFreezeFrameCaptured((code, ff) => {
      setFreezeFrames((prev) => ({ ...prev, [code]: ff }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);
  // Rà soát (code review): tránh setState sau khi màn hình đã unmount (user
  // rời màn giữa lúc đang chờ clearDtcAndRefresh()) - Alert.alert là API toàn
  // cục, nếu không chặn sẽ hiện dialog "xoá xong" cả khi user đã rời màn.
  const mountedRef = React.useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const hasAny = confirmed.length > 0 || pending.length > 0 || permanent.length > 0;
  const canClear = isConnected && confirmed.length > 0 && !clearing;
  const borderColor = confirmed.length > 0 ? '#EF4444' : pending.length > 0 ? '#F59E0B' : '#22C55E';

  const handleClear = () => {
    Alert.alert(t('obd.dtc_clear_confirm_title') || 'Xoá mã lỗi?', t('obd.dtc_clear_confirm_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('obd.dtc_clear_confirm_cta'),
        style: 'destructive',
        onPress: async () => {
          setClearing(true);
          const ok = await obdLiveMonitor.clearDtcAndRefresh();
          if (!mountedRef.current) return;
          setClearing(false);
          if (ok) onCleared();
          // Fix #9: Alert title không được rỗng, có thể gây crash.
          const title = ok ? t('obd.dtc_clear_success') : t('obd.dtc_clear_fail');
          const body = ok ? t('obd.readiness_disclaimer') : undefined;
          Alert.alert(title || (ok ? 'Thành công' : 'Thất bại'), body);
        },
      },
    ]);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: borderColor }]}>
      <View style={styles.cardHeader}>
        <FontAwesome5 name="microchip" size={15} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('obd.dtc_card_title')}</Text>
      </View>

      {!hasAny ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('obd.dtc_none')}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {confirmed.length > 0 && (
            <View style={{ gap: 3 }}>
              <Text style={[styles.dtcGroupLabel, { color: colors.textSecondary }]}>{t('obd.dtc_confirmed')}</Text>
              {confirmed.map((c) => {
                const info = lookupDtcOffline(c.code);
                const ff = freezeFrames[c.code];
                return (
                  <View key={c.code} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('DtcLookup', { code: c.code })}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>
                        {c.code}{info.known ? ` — ${info.title_vi}` : ''}
                        <Text style={{ color: colors.primary }}> {t('obd.dtc_view_detail')} ›</Text>
                      </Text>
                    </TouchableOpacity>
                    {/* Freeze frame (thông số ECU lúc mã lỗi xảy ra) - chỉ hiện nút
                        khi đã chụp xong (xem effect ở trên), việc chụp mất vài giây
                        sau khi mã lỗi vừa xuất hiện nên KHÔNG hiện icon rồi disable
                        (trông như lỗi) - ẩn hẳn tới khi có dữ liệu thật. */}
                    {ff && (
                      <TouchableOpacity
                        onPress={() => Alert.alert(t('obd.freeze_frame_title'), formatFreezeFrame(ff, t))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={t('obd.freeze_frame_title')}
                      >
                        <FontAwesome5 name="camera" size={13} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}
          {pending.length > 0 && (
            <View style={{ gap: 3 }}>
              <Text style={[styles.dtcGroupLabel, { color: colors.textSecondary }]}>{t('obd.dtc_pending')}</Text>
              {pending.map((c) => (
                <TouchableOpacity key={c.code} onPress={() => navigation.navigate('DtcLookup', { code: c.code })}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {c.code} <Text style={{ color: colors.primary }}>{t('obd.dtc_view_detail')} ›</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {permanent.length > 0 && (
            <View style={{ gap: 3 }}>
              <Text style={[styles.dtcGroupLabel, { color: colors.textSecondary }]}>{t('obd.dtc_permanent')}</Text>
              {permanent.map((c) => {
                const info = lookupDtcOffline(c.code);
                return (
                  <TouchableOpacity key={c.code} onPress={() => navigation.navigate('DtcLookup', { code: c.code })}>
                    <Text style={{ color: colors.text, fontSize: 13 }}>
                      {c.code}{info.known ? ` — ${info.title_vi}` : ''}
                      <Text style={{ color: colors.primary }}> {t('obd.dtc_view_detail')} ›</Text>
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
                {t('obd.dtc_permanent_note')}
              </Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={handleClear}
        disabled={!canClear}
        style={[styles.clearBtn, { opacity: canClear ? 1 : 0.4 }]}
      >
        <FontAwesome5 name="eraser" size={13} color="#EF4444" />
        <Text style={styles.clearBtnText}>{t('obd.dtc_clear_btn')}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ReadinessCard({ onStatusChange }: { onStatusChange?: (status: ReadinessStatus | null) => void }) {
  const colors = useColors();
  const t = useT();
  const [status, setStatus] = useState<ReadinessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // Rà soát (code review): tương tự DtcCard - chặn setState sau unmount (BLE
  // mất kết nối giữa lúc đang chờ readReadinessStatus() -> component unmount
  // qua {isConnected && <ReadinessCard/>} ở parent).
  const mountedRef = React.useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await readReadinessStatus();
    if (!mountedRef.current) return;
    setStatus(s);
    // Báo lên component cha (dùng cho nút "Chia sẻ kết quả") - KHÔNG tự đọc lại
    // readReadinessStatus() ở cha vì đây là lệnh BLE thật, gọi 2 nơi tốn round-trip
    // vô ích, khác các getter thuần bộ nhớ (DTC) đã dùng useDtcState() lần 2 được.
    onStatusChange?.(s);
    setLoading(false);
  }, [onStatusChange]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderLeftColor: status?.milOn ? '#EF4444' : '#22C55E' }]}>
      <View style={styles.cardHeader}>
        <FontAwesome5 name="clipboard-check" size={15} color={colors.text} />
        <Text style={[styles.cardTitle, { color: colors.text }]}>{t('obd.readiness_title')}</Text>
        <TouchableOpacity onPress={load} disabled={loading} accessibilityLabel={t('common.retry')}>
          <FontAwesome5 name="sync" size={13} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Chỉ báo "không phản hồi" khi đã đọc xong mà không có dữ liệu - lúc
          đang tải (loading) không hiện thông báo này, tránh nhấp nháy "lỗi"
          mỗi lần mở màn trong khi thực chất chỉ đang chờ round-trip BLE. */}
      {!status && !loading ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {t('obd.readiness_not_available')}
        </Text>
      ) : !status && loading ? (
        // Fix #5: Hiển thị rõ đang tải, thay vì không hiện gì (trông như lỗi)
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
          {t('common.loading')}
        </Text>
      ) : status ? (
        <>
          <Text style={{ color: status.milOn ? '#EF4444' : '#22C55E', fontSize: 14, fontWeight: '700' }}>
            {status.milOn ? t('obd.readiness_mil_on') : t('obd.readiness_mil_off')}
          </Text>
          {status.dtcCount > 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {t('obd.readiness_dtc_count', { n: status.dtcCount })}
            </Text>
          )}
          <View style={styles.readinessMonitorGrid}>
            {status.monitors.map((m) => {
              // 3 trạng thái đúng theo thiết kế gốc: đã xong / chưa xong / xe
              // không có monitor này (N/A) - Fix #13: trước đây ẨN HẲN monitor
              // N/A, khiến người dùng không phân biệt được "xe không có" với
              // "lỗi đọc". Giờ hiện rõ N/A.
              const icon = !m.supported ? 'minus-circle' : m.ready ? 'check-circle' : 'clock';
              const color = !m.supported ? colors.textSecondary : m.ready ? '#22C55E' : '#F59E0B'; // warn
              return (
                <TouchableOpacity
                  key={m.key}
                  style={styles.readinessMonitorRow}
                  onPress={() => Alert.alert(t(`obd.readiness_monitor_${m.key}` as any), t(`obd.readiness_monitor_desc_${m.key}` as any))}
                >
                  <FontAwesome5 name={icon} size={12} color={color} solid={m.supported} />
                  <Text style={{ color: m.supported ? colors.text : colors.textSecondary, fontSize: 12 }}>
                    {t(`obd.readiness_monitor_${m.key}` as any)}
                  </Text>
                  <FontAwesome5 name="info-circle" size={9} color={colors.textSecondary} />
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('obd.readiness_disclaimer')}</Text>
        </>
      ) : null}
    </View>
  );
}

export default function ObdSystemHealthScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';

  const t = useT();
  const colors = useColors();
  const { connectionState, liveSnapshot, findings, disconnect } = useObdConnection(vehicleId, vehicleName);
  const isConnected = connectionState === 'connected';

  // Ngắt kết nối (thêm cho luồng "Chẩn đoán xe" - trước đây màn này chỉ được
  // vào từ OBDDashboardScreen, nơi đã có nút ngắt riêng ở đó; giờ cũng là
  // điểm đến trực tiếp sau khi kết nối từ OBDSetupScreen với purpose=diagnostics,
  // nên cần có cách ngắt ngay tại đây). Cùng logic suppressForSession() như
  // OBDDashboardScreen.handleDisconnect - tránh popup tự kết nối lại ngay sau
  // khi user vừa chủ động ngắt.
  function handleDisconnect() {
    Alert.alert(t('obd.disconnect_title'), t('obd.disconnect_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('obd.disconnect_title'),
        style: 'destructive',
        onPress: async () => {
          await disconnect().catch(() => {});
          useObdAutoConnectSettingsStore.getState().suppressForSession();
          navigation.goBack();
        },
      },
    ]);
  }

  const systems = buildSystemHealth(findings, {
    rpm: liveSnapshot?.rpm ?? null,
    engineLoadPct: liveSnapshot?.engineLoadPct ?? null,
    throttlePct: liveSnapshot?.throttlePct ?? null,
    coolantTempC: liveSnapshot?.coolantTempC ?? null,
    controlModuleVoltage: liveSnapshot?.controlModuleVoltage ?? null,
    fuelLevelPct: liveSnapshot?.fuelLevelPct ?? null,
  });
  const overall = overallSystemStatus(systems);
  const overallClr = STATUS_COLOR[overall];
  // Rà soát (code review): xoá lỗi thành công phải kéo ReadinessCard đọc lại
  // ngay (MIL có thể vừa tắt) - trước đây 2 card độc lập, xoá xong DtcCard đã
  // hết mã nhưng ReadinessCard bên dưới vẫn hiện "đèn sáng" cũ tới khi user tự
  // bấm "Kiểm tra lại". Đổi key của ReadinessCard để remount = tự load lại.
  const [readinessRefreshKey, setReadinessRefreshKey] = useState(0);

  // Điểm sức khoẻ HỒ SƠ xe (bảo dưỡng/giấy tờ/chi phí, backend tính - KHÁC hẳn
  // "Tổng kết lần quét" bên dưới vốn chỉ dựa trên số liệu OBD sống vừa đọc
  // được). Hiện làm bối cảnh chung + link, KHÔNG gộp chung 1 con số với kết
  // quả quét vì 2 nguồn dữ liệu khác nhau, gộp lại dễ gây hiểu lầm (điểm hồ sơ
  // có thể vẫn cao dù lần quét này vừa phát hiện mã lỗi mới).
  const { data: vehicleHealth } = useQuery({
    queryKey: ['vehicles', vehicleId, 'health'],
    queryFn: () => vehiclesApi.health(vehicleId).then((r) => r.data?.data ?? r.data),
    enabled: !!vehicleId,
    staleTime: 1000 * 60 * 5,
  });
  const profileScore: number | null = vehicleHealth?.score?.total
    ?? (vehicleHealth?.health_score != null ? Number(vehicleHealth.health_score) : null);

  // Đếm DTC cho card Tổng kết + nội dung chia sẻ - gọi lại useDtcState() ở đây
  // thay vì kéo state ra khỏi DtcCard: đây chỉ là subscribe pub/sub thêm 1 lần
  // (nhẹ, không side-effect), đỡ phải luồn props qua lại giữa 2 component độc lập.
  const { confirmed: confirmedDtc, pending: pendingDtc, permanent: permanentDtc } = useDtcState();

  // Readiness nâng lên từ ReadinessCard (xem onStatusChange ở component đó) -
  // chỉ dùng để build nội dung chia sẻ, không đọc lại BLE ở đây.
  const [readinessStatus, setReadinessStatus] = useState<ReadinessStatus | null>(null);

  // Lời khuyên ưu tiên: finding NẶNG nhất nếu có (đã có action_vi sẵn) - nếu
  // không có finding nhưng có mã lỗi chưa rõ nguyên nhân, hướng user xem chi
  // tiết bên dưới - còn lại (không finding, không mã lỗi) thì trấn an.
  const topFinding = findings.find((f) => f.severity === 'critical') ?? findings.find((f) => f.severity === 'warn');
  const priorityAdvice = topFinding?.action_vi
    ?? (confirmedDtc.length > 0 ? t('obd.summary_advice_dtc_only') : t('obd.summary_advice_ok'));

  async function handleShare() {
    const message = buildScanReport({
      t, vehicleName, overall, priorityAdvice,
      confirmed: confirmedDtc, pending: pendingDtc, permanent: permanentDtc,
      readiness: readinessStatus, systems,
    });
    await Share.share({ message }).catch(() => {});
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.dtc_card_title')}</Text>
        {isConnected ? (
          <TouchableOpacity
            onPress={handleDisconnect}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={t('obd.disconnect_title')}
          >
            <FontAwesome5 name="times-circle" size={18} color="#EF4444" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 32 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={[styles.body, contentWide]}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('obd.sys_health_subtitle')}</Text>

        {/* Chưa kết nối: không bịa trạng thái, nói thẳng cần kết nối */}
        {!isConnected && !liveSnapshot ? (
          <View style={[styles.notConnected, { backgroundColor: colors.card }]}>
            <FontAwesome5 name="plug" size={22} color={colors.textSecondary} />
            <Text style={[styles.notConnectedText, { color: colors.textSecondary }]}>
              {t('obd.sys_not_connected')}
            </Text>
          </View>
        ) : (
          <>
            {/* Điểm sức khoẻ HỒ SƠ xe (bảo dưỡng/giấy tờ/chi phí - đã tính sẵn từ
                lúc thêm xe, KHÁC nguồn dữ liệu với phần quét OBD bên dưới) - chỉ
                làm bối cảnh + link, không gộp vào đánh giá lần quét. */}
            {profileScore != null && (
              <TouchableOpacity
                style={[styles.profileScoreRow, { backgroundColor: colors.card }]}
                onPress={() => navigation.navigate('Health', { vehicleId })}
              >
                <View style={[styles.profileScoreCircle, { borderColor: scoreColor(profileScore) }]}>
                  <Text style={{ color: scoreColor(profileScore), fontSize: 13, fontWeight: '800' }}>{profileScore}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{t('obd.profile_score_title')}</Text>
                  <Text style={{ color: scoreColor(profileScore), fontSize: 11.5, fontWeight: '600', marginTop: 1 }}>
                    {scoreBand(profileScore)}
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {/* Tổng kết LẦN QUÉT này (đánh giá định tính 4 mức, KHÔNG phải điểm
                0-100 - xem comment "cố ý không chấm điểm" ở systemHealth.ts:
                app chưa có dữ liệu chạy thật để hiệu chuẩn thang điểm riêng cho
                số liệu OBD sống, bịa 1 con số dễ gây hiểu lầm chính xác giả).
                Kèm lời khuyên ưu tiên ngay dưới đánh giá - không phải chỉ liệt
                kê số liệu suông. */}
            <View style={[styles.summaryCard, { backgroundColor: overallClr + '14', borderColor: overallClr }]}>
              <View style={styles.overallBadge}>
                <FontAwesome5 name={STATUS_ICON[overall]} size={18} color={overallClr} solid />
                <Text style={[styles.overallText, { color: overallClr }]}>
                  {t(`obd.sys_status_${overall}` as any)}
                </Text>
              </View>
              <Text style={[styles.summaryAdvice, { color: colors.text }]}>{priorityAdvice}</Text>
              <Text style={[styles.summaryCounts, { color: colors.textSecondary }]}>
                {t('obd.summary_counts', { dtc: confirmedDtc.length, warn: findings.length })}
              </Text>
            </View>

            {/* Trang kỹ thuật: xem hết bảng PID sống (giống nút cùng tên ở
                OBDDashboardScreen) - cần thêm ở đây vì luồng "Chẩn đoán xe"
                (purpose=diagnostics ở OBDSetupScreen) vào THẲNG màn này, không
                còn đi qua Dashboard để bấm nút gốc nữa. */}
            {isConnected && (
              <TouchableOpacity
                style={[styles.techLinkBtn, { backgroundColor: colors.card }]}
                onPress={() => navigation.navigate('OBDTechnical', { vehicleId })}>
                <FontAwesome5 name="table" size={14} color={colors.primary} />
                <Text style={[styles.techLinkText, { color: colors.primary }]}>{t('obd.tech_link')}</Text>
                <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            {/* Chia sẻ kết quả - bản NGƯỜI ĐỌC ĐƯỢC (buildScanReport), khác "Xuất
                log phiên" ở OBDSetupScreen (log kỹ thuật thô để gỡ lỗi). Không cần
                ghi backend - Share API lấy nội dung ngay tại thời điểm bấm. */}
            {isConnected && (
              <TouchableOpacity
                style={[styles.techLinkBtn, { backgroundColor: colors.card }]}
                onPress={handleShare}>
                <FontAwesome5 name="share-alt" size={14} color={colors.primary} />
                <Text style={[styles.techLinkText, { color: colors.primary }]}>{t('obd.share_result_btn')}</Text>
                <FontAwesome5 name="chevron-right" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            )}

            <DtcCard isConnected={isConnected} onCleared={() => setReadinessRefreshKey((k) => k + 1)} />
            {isConnected && <ReadinessCard key={readinessRefreshKey} onStatusChange={setReadinessStatus} />}

            {systems.map((sys) => (
              <SystemCard key={sys.key} sys={sys} snapshot={liveSnapshot} />
            ))}

            <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('obd.sys_disclaimer')}</Text>
          </>
        )}
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
  overallBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  overallText: { fontSize: 15, fontWeight: '800' },
  profileScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
  },
  profileScoreCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  summaryAdvice: { fontSize: 13.5, lineHeight: 19 },
  summaryCounts: { fontSize: 11.5, fontWeight: '600' },
  techLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  techLinkText: { flex: 1, fontSize: 13, fontWeight: '600' },
  card: {
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  readingsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  reading: { minWidth: 64 },
  readingValue: { fontSize: 18, fontWeight: '700' },
  readingLabel: { fontSize: 11, marginTop: 1 },
  readingRange: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  findingRow: { flexDirection: 'row', gap: 8, borderTopWidth: 1, paddingTop: 10 },
  findingTitle: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  findingAction: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  findingCost: { fontSize: 11, fontStyle: 'italic', marginTop: 3 },
  notConnected: { borderRadius: 12, padding: 24, alignItems: 'center', gap: 12 },
  notConnectedText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  disclaimer: { fontSize: 11, fontStyle: 'italic', lineHeight: 16, marginTop: 4 },
  dtcGroupLabel: { fontSize: 11, fontWeight: '700' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 8,
  },
  clearBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  readinessMonitorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  readinessMonitorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: '45%' },
});
