import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useColors } from '../../utils/theme';
import { useT, useI18nStore } from '../../i18n';
import { useGpsTripState, useGpsTrips } from '../../hooks/useGpsTrip';
import { useVehicles } from '../../hooks/useVehicles';
import { devicesApi, DeviceSession } from '../../api/devices';
import { GpsTripRecord, gpsTripsApi } from '../../api/gpsTrips';
import { openLocationSettings, openBatterySettings } from '../../services/gps/GpsTripTracker';
import { detectDrivingEvents, computeDrivingScoreByDistance } from '../../services/drivingScore/drivingScoreEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RouteMap from '../../components/RouteMap';
import dayjs from 'dayjs';

// Mẹo tắt tối ưu pin - chỉ hiện 1 lần (lần đầu bật theo dõi thành công)
async function maybeShowBatteryTip() {
  try {
    if (await AsyncStorage.getItem('gps_battery_tip_shown')) return;
    await AsyncStorage.setItem('gps_battery_tip_shown', '1');
    const t = useI18nStore.getState().t;
    Alert.alert(
      t('gps_trips.battery_tip_title'),
      t('gps_trips.battery_tip_body'),
      [
        { text: t('gps_trips.later'), style: 'cancel' },
        { text: t('gps_trips.open_battery_settings'), onPress: () => openBatterySettings() },
      ],
    );
  } catch { /* ignore */ }
}

function formatDuration(seconds: number): string {
  const t = useI18nStore.getState().t;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return t('gps_trips.duration_long', { h, m });
  return t('gps_trips.duration', { min: m });
}

function timeAgo(ts: number | null): string {
  const t = useI18nStore.getState().t;
  if (!ts) return t('gps_trips.time_none');
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return t('gps_trips.seconds_ago', { sec });
  const min = Math.floor(sec / 60);
  return t('gps_trips.minutes_ago', { min });
}

function StatusBadge({ status, tracking, paused }: { status: string; tracking: boolean; paused?: boolean }) {
  const t = useT();
  const colors = useColors();
  const isActive = status === 'active' || status === 'waiting_stop';
  const isWaiting = status === 'waiting_start';
  // Đang theo dõi nhưng chưa vào chuyến (status idle) -> báo rõ "chờ di chuyển"
  const isArmedIdle = tracking && status === 'idle';

  const label = paused
    ? t('gps_trips.status_paused')
    : isActive
    ? t('gps_trips.status_active')
    : isWaiting
    ? t('gps_trips.status_waiting')
    : isArmedIdle
    ? t('gps_trips.status_armed_idle')
    : t('gps_trips.status_idle');

  const color = paused ? colors.warning
    : isActive ? colors.success
    : isWaiting ? colors.warning
    : isArmedIdle ? colors.success
    : colors.textSecondary;

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      {!paused && (isActive || isWaiting || isArmedIdle) && <View style={[styles.dot, { backgroundColor: color }]} />}
      {paused && <FontAwesome5 name="pause" size={9} color={color} solid style={{ marginRight: 5 }} />}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function DiagRow({ icon, label, value, valueColor }: { icon: string; label: string; value: string; valueColor?: string }) {
  const colors = useColors();
  return (
    <View style={styles.diagRow}>
      <FontAwesome5 name={icon} size={11} color={colors.textSecondary} solid style={{ width: 16 }} />
      <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.diagValue, { color: valueColor ?? colors.text }]}>{value}</Text>
    </View>
  );
}

function CheckRow({ ok, label, fixLabel, onFix, advisory }: {
  ok: boolean; label: string; fixLabel?: string; onFix?: () => void; advisory?: boolean;
}) {
  const colors = useColors();
  const t = useT();
  const color = ok ? colors.success : advisory ? colors.warning : colors.error;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}>
      <FontAwesome5 name={ok ? 'check-circle' : advisory ? 'exclamation-circle' : 'times-circle'} size={13} color={color} solid />
      <Text style={{ color: colors.text, fontSize: 12.5, flex: 1 }}>{label}</Text>
      {!ok && onFix && (
        <TouchableOpacity onPress={onFix} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: color }}>
          <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{fixLabel ?? t('common.edit')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ReadinessChecklist({ r }: { r: { foreground: boolean; background: boolean; locationEnabled: boolean } }) {
  const colors = useColors();
  const t = useT();
  // Đủ điều kiện ghi tốt nhất = quyền vị trí + định vị bật + quyền nền
  const allGood = r.foreground && r.locationEnabled && r.background;

  if (allGood) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <FontAwesome5 name="check-circle" size={13} color={colors.success} solid />
        <Text style={{ color: colors.success, fontSize: 12.5, fontWeight: '600' }}>{t('gps_trips.ready_best')}</Text>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>{t('gps_trips.permissions_header')}</Text>
      <CheckRow ok={r.foreground} label={t('gps_trips.check_location_perm')} fixLabel={t('gps_trips.grant')} onFix={() => Linking.openSettings()} />
      <CheckRow ok={r.locationEnabled} label={t('gps_trips.check_location_enabled')} fixLabel={t('gps_trips.turn_on')} onFix={() => openLocationSettings()} />
      <CheckRow ok={r.background} advisory label={t('gps_trips.check_always_allow')} fixLabel={t('gps_trips.grant')} onFix={() => Linking.openSettings()} />
      <CheckRow ok={false} advisory label={t('gps_trips.check_battery_opt')} fixLabel={t('gps_trips.open')} onFix={() => openBatterySettings()} />
    </View>
  );
}

function InterruptedTripBanner({
  info,
  onResume,
  onSave,
  onDiscard,
}: {
  info: NonNullable<ReturnType<typeof useGpsTripState>['interruptedInfo']>;
  onResume: () => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const minAgo = info.timeSinceInterruptMin;
  const canSave = info.distanceKm >= 0.3;

  return (
    <View style={{
      backgroundColor: '#2C1810', borderRadius: 12, padding: 14,
      borderWidth: 1.5, borderColor: '#F97316', marginBottom: 12,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <FontAwesome5 name="exclamation-triangle" size={14} color="#F97316" solid />
        <Text style={{ color: '#F97316', fontWeight: '700', fontSize: 14 }}>
          {t('gps_trips.interrupted_title')}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 13, marginBottom: 4 }}>
        {minAgo > 0
          ? t('gps_trips.interrupted_body_ago', { min: minAgo })
          : t('gps_trips.interrupted_body_now')}
      </Text>
      {info.distanceKm > 0 && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 10 }}>
          {t('gps_trips.interrupted_recorded', { km: info.distanceKm.toFixed(1) })}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {info.canResume && (
          <TouchableOpacity
            onPress={onResume}
            style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 13 }}>{t('gps_trips.resume')}</Text>
          </TouchableOpacity>
        )}
        {canSave && (
          <TouchableOpacity
            onPress={onSave}
            style={{ flex: 1, backgroundColor: colors.success, borderRadius: 8, paddingVertical: 9, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{t('gps_trips.save_trip')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDiscard}
          style={{ flex: info.canResume || canSave ? 0 : 1, backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: 13 }}>
            {canSave ? t('gps_trips.discard') : t('common.delete')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActiveTripCard({ vehicleId }: { vehicleId: number }) {
  const colors = useColors();
  const t = useT();
  // Màn ngang (head-unit ô tô) thấp -> bản đồ live thấp hơn để chừa chỗ cho danh sách hành trình.
  const { width, height } = useWindowDimensions();
  const mapH = width > height ? 120 : 150;
  const { tripState, tracking, permission, routePoints, interruptedInfo,
    startTracking, stop, pause, resume, resumeInterrupted, saveInterrupted, discardInterrupted,
    checkRecordable } = useGpsTripState();

  const status = tripState?.status ?? 'idle';
  const paused = tripState?.paused ?? false;
  // "Đang theo dõi" = dịch vụ GPS đã bật (kể cả khi chưa vào chuyến / status='idle').
  // Trước đây dùng `status !== 'idle'` khiến bật xong UI không đổi gì -> tưởng lỗi.
  const isRunning = tracking;
  // Có chuyến đang ghi (đang chạy/đang dừng/đang chờ bắt đầu) -> cho phép tạm dừng
  const inTrip = isRunning && (status === 'active' || status === 'waiting_stop' || status === 'waiting_start' || paused);
  const distanceKm = tripState?.distanceKm ?? 0;
  const maxSpeed = tripState?.maxSpeedKmh ?? 0;
  const lastSpeed = tripState?.lastSpeedKmh ?? 0;
  const accuracy = tripState?.lastAccuracy ?? null;
  const lastTs = tripState?.lastTs ?? null;
  const pointCount = routePoints.length;

  // Rebuild the live map HTML when count OR the latest point changes (handles the
  // downsample case where length stays the same but coordinates advance).
  const lastPt = routePoints[routePoints.length - 1];
  const liveMapPoints = useMemo(
    () => routePoints.map((p) => ({ lat: p.lat, lng: p.lng })),
    [routePoints.length, lastPt?.ts], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleToggle = useCallback(async () => {
    if (isRunning) {
      const recordable = await checkRecordable();
      if (recordable) {
        // Đang có hành trình ghi được -> hỏi lưu hay bỏ
        Alert.alert(t('gps_trips.end_trip_title'), t('gps_trips.end_trip_body'), [
          { text: t('gps_trips.keep_recording'), style: 'cancel' },
          { text: t('gps_trips.discard_no_save'), style: 'destructive', onPress: () => stop(false) },
          { text: t('common.save'), onPress: async () => {
            const saved = await stop(true);
            if (saved) {
              Alert.alert(t('gps_trips.saved_title'), t('gps_trips.saved_body', { km: Number(saved.distanceKm).toFixed(1) }));
            }
          } },
        ]);
      } else {
        // Chỉ đang theo dõi, chưa vào chuyến -> tắt luôn
        Alert.alert(t('gps_trips.stop_tracking_title'), t('gps_trips.stop_tracking_body'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('gps_trips.turn_off'), style: 'destructive', onPress: () => stop(true) },
        ]);
      }
    } else {
      if (!vehicleId) {
        Alert.alert(t('common.notice'), t('gps_trips.no_vehicle'));
        return;
      }
      try {
        const result = await startTracking(vehicleId);
        if (result.ok) {
          maybeShowBatteryTip();
          if (!result.backgroundGranted) {
            // Started, but only works while app is open. Nudge to enable "Always".
            Alert.alert(
              t('gps_trips.tracking_on_title'),
              t('gps_trips.tracking_on_body'),
              [
                { text: t('gps_trips.later'), style: 'cancel' },
                { text: t('gps_trips.open_settings'), onPress: () => Linking.openSettings() },
              ],
            );
          }
        } else if (result.reason === 'vehicle_locked') {
          Alert.alert(
            t('gps_trips.vehicle_locked_title'),
            t('gps_trips.vehicle_locked_body'),
            [{ text: t('common.ok'), style: 'cancel' }],
          );
        } else if (result.reason === 'location_off') {
          Alert.alert(
            t('gps_trips.location_off_title'),
            t('gps_trips.location_off_body'),
            [
              { text: t('common.close'), style: 'cancel' },
              { text: t('gps_trips.open_location_settings'), onPress: () => openLocationSettings() },
            ],
          );
        } else if (result.reason === 'background_denied') {
          Alert.alert(
            t('gps_trips.background_denied_title'),
            t('gps_trips.background_denied_body'),
            [
              { text: t('common.close'), style: 'cancel' },
              { text: t('gps_trips.open_settings'), onPress: () => Linking.openSettings() },
            ],
          );
        } else if (result.reason === 'foreground_denied') {
          Alert.alert(t('gps_trips.location_perm_title'), t('gps_trips.perm_denied'), [
            { text: t('common.close'), style: 'cancel' },
            { text: t('gps_trips.open_settings'), onPress: () => Linking.openSettings() },
          ]);
        } else {
          Alert.alert(t('gps_trips.enable_failed_title'), t('gps_trips.enable_failed_body', { error: result.error ?? t('gps_trips.unknown') }));
        }
      } catch (e: any) {
        Alert.alert(t('gps_trips.enable_failed_title'), e?.message ?? t('gps_trips.enable_failed_generic'));
      }
    }
  }, [isRunning, vehicleId, startTracking, stop, checkRecordable, t]);

  const handlePauseResume = useCallback(async () => {
    if (paused) await resume();
    else await pause();
  }, [paused, pause, resume]);

  // Hành trình bị gián đoạn: hỏi resume trước khi hiển thị các nút bình thường
  const handleResume = useCallback(async () => {
    const result = await resumeInterrupted();
    if (!result.ok) {
      if (result.reason === 'vehicle_locked') {
        Alert.alert(t('gps_trips.vehicle_locked_title'), t('gps_trips.vehicle_locked_short'), [{ text: t('common.ok') }]);
      } else if (result.reason === 'foreground_denied' || result.reason === 'background_denied') {
        Alert.alert(t('gps_trips.location_perm_title'), t('gps_trips.resume_perm_body'), [
          { text: t('common.close'), style: 'cancel' },
          { text: t('gps_trips.settings'), onPress: () => { const { Linking } = require('react-native'); Linking.openSettings(); } },
        ]);
      } else {
        Alert.alert(t('gps_trips.resume_failed_title'), t('gps_trips.resume_failed_body'), [{ text: t('common.ok') }]);
      }
    }
  }, [resumeInterrupted]);

  return (
    <View style={[styles.activeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {interruptedInfo?.hasInterrupted && (
        <InterruptedTripBanner
          info={interruptedInfo}
          onResume={handleResume}
          onSave={saveInterrupted}
          onDiscard={() => Alert.alert(
            t('gps_trips.discard_trip_title'),
            t('gps_trips.discard_trip_body'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              { text: t('common.delete'), style: 'destructive', onPress: discardInterrupted },
            ],
          )}
        />
      )}
      <View style={styles.activeRow}>
        <StatusBadge status={status} tracking={tracking} paused={paused} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {inTrip && (
            <TouchableOpacity
              onPress={handlePauseResume}
              style={[styles.toggleBtn, { backgroundColor: paused ? colors.success : colors.warning }]}>
              <FontAwesome5 name={paused ? 'play' : 'pause'} size={12} color="#fff" solid />
              <Text style={styles.toggleBtnText}>{paused ? t('gps_trips.resume') : t('gps_trips.pause')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleToggle}
            style={[styles.toggleBtn, { backgroundColor: isRunning ? colors.error : colors.primary }]}>
            <FontAwesome5 name={isRunning ? 'stop' : 'play'} size={12} color="#fff" solid />
            <Text style={styles.toggleBtnText}>
              {isRunning ? t('gps_trips.btn_stop') : t('gps_trips.btn_enable')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Thông báo đang tạm dừng */}
      {paused && (
        <View style={[styles.warnBox, { borderColor: colors.warning, marginTop: 12 }]}>
          <FontAwesome5 name="pause-circle" size={12} color={colors.warning} solid />
          <Text style={[styles.warnText, { color: colors.warning }]}>
            {t('gps_trips.paused_notice')}
          </Text>
        </View>
      )}

      {/* Bảng sẵn sàng - hiện gọn khi OK, banh ra khi có vấn đề (lúc chưa chạy) */}
      {!isRunning && <ReadinessChecklist r={permission} />}

      {/* Permission warning */}
      {isRunning && permission.foreground && !permission.background && (
        <TouchableOpacity onPress={() => Linking.openSettings()} style={[styles.warnBox, { borderColor: colors.warning }]}>
          <FontAwesome5 name="exclamation-triangle" size={11} color={colors.warning} solid />
          <Text style={[styles.warnText, { color: colors.warning }]}>
            {t('gps_trips.foreground_only_warn')}
          </Text>
        </TouchableOpacity>
      )}

      {/* Live diagnostics so the user can SEE GPS is alive */}
      {isRunning && (
        <View style={styles.diagBox}>
          <DiagRow
            icon="satellite-dish"
            label={t('gps_trips.diag_gps_signal')}
            value={lastTs ? timeAgo(lastTs) : t('gps_trips.waiting_short')}
            valueColor={lastTs && Date.now() - lastTs < 15000 ? colors.success : colors.warning}
          />
          <DiagRow
            icon="crosshairs"
            label={t('gps_trips.diag_accuracy')}
            value={accuracy != null ? `${Math.round(accuracy)} m${accuracy > 50 ? ` (${t('gps_trips.accuracy_weak')})` : accuracy > 20 ? ` (${t('gps_trips.accuracy_fair')})` : ` (${t('gps_trips.accuracy_good')})`}` : '-'}
            valueColor={accuracy == null ? undefined : accuracy > 50 ? colors.error : accuracy > 20 ? colors.warning : colors.success}
          />
          <DiagRow icon="tachometer-alt" label={t('gps_trips.diag_speed')} value={`${lastSpeed} km/h`} />
          <DiagRow icon="map-pin" label={t('gps_trips.diag_points')} value={`${pointCount}`} />
        </View>
      )}

      {isRunning && status === 'active' && (
        <View style={styles.liveStats}>
          <View style={styles.liveStat}>
            <FontAwesome5 name="road" size={14} color={colors.primary} solid />
            <Text style={[styles.liveStatVal, { color: colors.text }]}>{distanceKm.toFixed(1)} km</Text>
          </View>
          <View style={styles.liveStat}>
            <FontAwesome5 name="flag-checkered" size={14} color={colors.primary} solid />
            <Text style={[styles.liveStatVal, { color: colors.text }]}>{t('gps_trips.live_max_speed', { spd: Math.round(maxSpeed) })}</Text>
          </View>
        </View>
      )}

      {isRunning && status === 'idle' && (
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {t('gps_trips.hint_waiting_drive')}
        </Text>
      )}
      {isRunning && status === 'waiting_start' && (
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          {t('gps_trips.hint_movement_detected')}
        </Text>
      )}

      {/* Live map */}
      {isRunning && pointCount > 0 && (
        <View style={{ marginTop: 8 }}>
          <RouteMap points={liveMapPoints} height={mapH} live />
        </View>
      )}
    </View>
  );
}

function TripRow({ trip, expanded, onToggle, onDelete, onEditNote }: {
  trip: GpsTripRecord; expanded: boolean; onToggle: () => void;
  onDelete: (t: GpsTripRecord) => void; onEditNote: (t: GpsTripRecord) => void;
}) {
  const colors = useColors();
  const t = useT();
  // Backend decimals can serialize as string or null - coerce defensively
  const distanceKm = Number(trip.distance_km ?? 0);
  const avgSpeed = trip.avg_speed_kmh != null ? Number(trip.avg_speed_kmh) : null;
  const maxSpeed = trip.max_speed_kmh != null ? Number(trip.max_speed_kmh) : null;
  const durationSec = Number(trip.driving_time_seconds ?? 0) + Number(trip.idle_time_seconds ?? 0);
  const date = dayjs(trip.started_at);
  const points = Array.isArray(trip.route_points) ? trip.route_points : [];
  const hasRoute = points.length >= 2;

  // Chấm điểm lái xe (Giai đoạn G): tính LẠI từ route_points đã lưu sẵn mỗi 5s
  // cho mọi chuyến từ trước tới giờ - không cần đổi gì ở backend/tần suất GPS,
  // xem _bmad-output/driving-score-design-proposal-2026-07-14.md.
  const drivingScore = useMemo(() => {
    if (points.length < 2) return null;
    const events = detectDrivingEvents(points.map((p) => ({ ts: p.ts, speedKmh: p.spd })));
    return computeDrivingScoreByDistance(events, distanceKm);
  }, [points, distanceKm]);

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.rowHeader}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowDate, { color: colors.textSecondary }]}>{date.format('DD/MM HH:mm')}</Text>
            <Text style={[styles.rowDistance, { color: colors.text }]}>{distanceKm.toFixed(1)} km</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.primary, fontSize: 12 }}>{expanded ? t('gps_trips.collapse') : t('gps_trips.details')}</Text>
            <FontAwesome5 name={expanded ? 'chevron-up' : 'chevron-down'} size={13} color={colors.primary} solid />
          </View>
        </View>
        {/* Điểm đầu/cuối tách 2 dòng riêng (mỗi cái tối đa 2 dòng) - chuỗi gộp dễ cụt mất chữ trên màn nhỏ. */}
        {(trip.start_address || trip.end_address) ? (
          <View style={{ gap: 3, marginBottom: 4 }}>
            {trip.start_address ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <FontAwesome5 name="map-marker-alt" size={11} color="#10b981" style={{ marginTop: 2 }} solid />
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={2}>
                  {trip.start_address}
                </Text>
              </View>
            ) : null}
            {trip.end_address ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                <FontAwesome5 name="flag-checkered" size={11} color="#f43f5e" style={{ marginTop: 2 }} solid />
                <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }} numberOfLines={2}>
                  {trip.end_address}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {trip.ghi_chu ? (
          <Text style={{ color: colors.text, fontSize: 13, fontStyle: 'italic', marginBottom: 6 }} numberOfLines={2}>
            "{trip.ghi_chu}"
          </Text>
        ) : null}
        <View style={styles.rowChips}>
          {durationSec > 0 && <Chip icon="clock" label={formatDuration(durationSec)} />}
          {avgSpeed !== null && <Chip icon="tachometer-alt" label={t('gps_trips.avg_speed', { spd: avgSpeed })} />}
          {maxSpeed !== null && <Chip icon="flag-checkered" label={t('gps_trips.max_speed', { spd: maxSpeed })} />}
          {points.length > 0 && <Chip icon="map-marker-alt" label={t('gps_trips.chip_points', { n: points.length })} />}
          {/* Chỉ hiện khi có sự kiện (tránh rợp mọi dòng bằng "0 lần") - tín hiệu
              THÔ hơn nguồn OBD vì GPS lấy mẫu mỗi 5s, xem tài liệu thiết kế. */}
          {!!drivingScore?.harshBrakeCount && (
            <Chip icon="exclamation-triangle" label={t('gps_trips.harsh_brake_count', { n: drivingScore.harshBrakeCount })} />
          )}
          {!!drivingScore?.harshAccelCount && (
            <Chip icon="bolt" label={t('gps_trips.harsh_accel_count', { n: drivingScore.harshAccelCount })} />
          )}
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: 10 }}>
          {hasRoute && (
            <RouteMap points={points.map((p) => ({ lat: p.lat, lng: p.lng }))} height={240} />
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => onEditNote(trip)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <FontAwesome5 name="pen" size={12} color={colors.text} solid />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{trip.ghi_chu ? t('gps_trips.edit_note') : t('gps_trips.add_note')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onDelete(trip)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.error }}>
              <FontAwesome5 name="trash" size={12} color={colors.error} solid />
              <Text style={{ color: colors.error, fontSize: 13, fontWeight: '600' }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  const colors = useColors();
  return (
    <View style={styles.chip}>
      <FontAwesome5 name={icon} size={10} color={colors.textSecondary} solid />
      <Text style={[styles.chipText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

// Quản lý "Máy chính ghi hành trình": 1 thời điểm chỉ 1 máy nên khi máy KHÁC (không phải
// máy chính) mở màn Hành trình -> hỏi có chuyển máy chính sang máy này không.
function GpsPrimaryBanner() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['device-sessions'],
    queryFn: () => devicesApi.list().then((r) => r.data.data),
    staleTime: 30_000,
  });
  const sessions: DeviceSession[] = Array.isArray(data) ? data : [];
  const current = sessions.find((s) => s.is_current);
  const primary = sessions.find((s) => s.is_gps_primary);
  const isThisPrimary = !!current?.is_gps_primary;
  const promptedRef = useRef(false);

  const setPrimary = useMutation({
    mutationFn: (id: number) => devicesApi.setPrimary(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['device-sessions'] }),
  });

  const makeThisPrimary = useCallback(() => {
    if (current) setPrimary.mutate(current.id);
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  // Máy khác đang là máy chính -> hỏi 1 lần khi vào màn.
  useEffect(() => {
    if (promptedRef.current || !current) return;
    if (primary && primary.id !== current.id && !isThisPrimary) {
      promptedRef.current = true;
      Alert.alert(
        t('gps_trips.primary_switch_title'),
        t('gps_trips.primary_switch_body', { name: primary.device_name }),
        [
          { text: t('gps_trips.primary_keep'), style: 'cancel' },
          { text: t('gps_trips.primary_switch_here'), onPress: makeThisPrimary },
        ],
      );
    }
  }, [primary?.id, current?.id, isThisPrimary]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!current) return null;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: isThisPrimary ? '#f59e0b55' : colors.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <FontAwesome5 name="star" size={14} color={isThisPrimary ? '#f59e0b' : colors.textSecondary} solid />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{t('gps_trips.primary_device_label')}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }} numberOfLines={1}>
          {isThisPrimary ? t('gps_trips.primary_is_this') : (primary?.device_name ?? t('gps_trips.primary_none'))}
        </Text>
      </View>
      {!isThisPrimary && (
        <TouchableOpacity onPress={makeThisPrimary} disabled={setPrimary.isPending}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#f59e0b', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <FontAwesome5 name="star" size={10} color="#f59e0b" solid />
          <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }}>{t('gps_trips.primary_set_this')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function GpsTripsScreen({ embedded }: { embedded?: boolean } = {}) {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // Mở từ FAB không có param -> dùng xe mặc định
  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];
  const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];

  const vehicleId: number = route.params?.vehicleId ?? defaultVehicle?.id ?? 0;
  const colors = useColors();
  const t = useT();

  const vehicleName: string = route.params?.vehicleName
    ?? defaultVehicle?.ten ?? defaultVehicle?.name ?? t('common.vehicle');

  const { data, isLoading, refetch, isFetching } = useGpsTrips(vehicleId);
  const trips: GpsTripRecord[] = data?.data ?? [];
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteTrip, setNoteTrip] = useState<GpsTripRecord | null>(null);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleDelete = useCallback((trip: GpsTripRecord) => {
    Alert.alert(t('gps_trips.delete_trip_title'), t('gps_trips.delete_trip_body', { km: Number(trip.distance_km ?? 0).toFixed(1), date: dayjs(trip.started_at).format('DD/MM') }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          try { await gpsTripsApi.remove(trip.id); await refetch(); }
          catch { Alert.alert(t('common.error'), t('gps_trips.delete_failed')); }
        },
      },
    ]);
  }, [refetch, t]);

  const openNote = useCallback((trip: GpsTripRecord) => {
    setNoteTrip(trip);
    setNoteText(trip.ghi_chu ?? '');
  }, []);

  const saveNote = useCallback(async () => {
    if (!noteTrip) return;
    setBusy(true);
    try {
      await gpsTripsApi.updateNote(noteTrip.id, noteText.trim());
      await refetch();
      setNoteTrip(null);
    } catch {
      Alert.alert(t('common.error'), t('gps_trips.note_save_failed'));
    } finally {
      setBusy(false);
    }
  }, [noteTrip, noteText, refetch, t]);

  // embedded=true: hiển thị trong tab Thống kê -> KHÔNG tự thêm SafeAreaView(top) + header
  // (tab Thống kê đã có chrome trên) để tránh "block thừa" ở đầu. Standalone thì giữ nguyên.
  const Container: any = embedded ? View : SafeAreaView;
  const containerProps: any = embedded ? {} : { edges: ['top', 'left', 'right'] };
  return (
    <Container style={[styles.root, { backgroundColor: colors.background }]} {...containerProps}>
      <AppBgPattern />
      {!embedded && (
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.headerTitle, { color: colors.text }]}>{t('gps_trips.title')}</Text>
          <Text style={[styles.headerSub, { color: colors.textSecondary }]}>{vehicleName}</Text>
        </View>
      </View>
      )}

      <FlatList
        data={trips}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <>
            <GpsPrimaryBanner />
            <ActiveTripCard vehicleId={vehicleId} />
          </>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <FontAwesome5 name="route" size={40} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('gps_trips.empty')}</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{t('gps_trips.empty_sub')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TripRow
            trip={item}
            expanded={expandedId === item.id}
            onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
            onDelete={handleDelete}
            onEditNote={openNote}
          />
        )}
        contentContainerStyle={[styles.list, isLandscape && { maxWidth: 760, alignSelf: 'center', width: '100%' }]}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />

      {/* Modal sửa ghi chú hành trình */}
      <Modal visible={noteTrip !== null} transparent animationType="fade" onRequestClose={() => setNoteTrip(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 28 }} onPress={() => setNoteTrip(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>{t('gps_trips.trip_note')}</Text>
            <TextInput
              value={noteText}
              onChangeText={setNoteText}
              placeholder={t('gps_trips.note_placeholder')}
              placeholderTextColor={colors.textSecondary}
              maxLength={255}
              style={{ backgroundColor: colors.background, color: colors.text, borderRadius: 10, padding: 12, minHeight: 48 }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setNoteTrip(null)} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveNote} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: colors.primary }}>
                <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{busy ? t('gps_trips.saving') : t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </Container>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  headerSub: { fontSize: 12, marginTop: 1 },
  list: { padding: 10, gap: 8, paddingBottom: 24 },
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySub: { fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  activeCard: { borderRadius: 12, borderWidth: 1, padding: 11, marginBottom: 8 },
  activeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
  },
  warnText: { fontSize: 11, flex: 1 },

  diagBox: { marginTop: 8, gap: 5 },
  diagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diagLabel: { fontSize: 12, flex: 1 },
  diagValue: { fontSize: 12, fontWeight: '600' },

  liveStats: { flexDirection: 'row', gap: 20, marginTop: 8 },
  liveStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveStatVal: { fontSize: 14, fontWeight: '600' },
  hintText: { fontSize: 12, marginTop: 8 },

  row: { borderRadius: 10, borderWidth: 1, padding: 10 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLeft: { marginBottom: 6 },
  rowDate: { fontSize: 12 },
  rowDistance: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  rowChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 12 },
});
