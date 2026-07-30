import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { State as BleAdapterState } from 'react-native-ble-plx';
import { FontAwesome5 } from '@expo/vector-icons';
import NotedriBtPairing, { ClassicBtDevice } from '../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';
import { useAuthStore } from '../store/authStore';
import { useObdAutoConnectSettingsStore } from '../store/obdAutoConnectSettingsStore';
import { bleService } from '../services/obd/BleService';
import { getAutoConnectPairing, setAutoConnect } from '../services/obd/pairedDevices';
import { resolveDefaultVehicle } from '../services/vehicles/resolveDefaultVehicle';
import { useObdConnection } from '../hooks/useObd';
import { navigationRef } from '../navigation/navigationRef';
import { useT } from '../i18n';

const COOLDOWN_MS = 60_000;
const INITIAL_ATTEMPT_DELAY_MS = 5000;
const BLE_ATTEMPT_TIMEOUT_MS = 16_000;
const AUTO_CONNECT_COUNTDOWN_SECONDS = 5;

const SKIP_ON_ROUTES = new Set(['OBDSetup', 'OBDDashboard']);

type AttemptTarget = {
  vehicleId: number;
  vehicleName: string;
  deviceId: string;
  transport: 'ble' | 'classic';
};

type AutoConnectEndReason = 'completed' | 'completed-silent' | 'dismissed' | 'failed';
type AutoConnectNotice = {
  kind: 'connected';
  vehicleId: number;
  vehicleName: string;
  deviceName: string;
};

function AutoConnectPrompt({
  target,
  onEnd,
}: {
  target: AttemptTarget;
  onEnd: (reason: AutoConnectEndReason, target: AttemptTarget, deviceName: string) => void;
}) {
  const t = useT();
  const { connectionState, foundDevices, startScan, stopScan, connect, connectClassic, disconnect } =
    useObdConnection(target.vehicleId, target.vehicleName);
  const [phase, setPhase] = useState<'countdown' | 'connecting' | 'canceling' | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONNECT_COUNTDOWN_SECONDS);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bleMatchRef = useRef<{ id: string; name: string } | null>(null);
  const classicMatchRef = useRef<ClassicBtDevice | null>(null);
  const settledRef = useRef(false);
  const connectingRef = useRef(false);
  const abortRequestedRef = useRef(false);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const clearFinishTimer = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
  }, []);

  const finish = useCallback((reason: AutoConnectEndReason) => {
    if (settledRef.current) return;
    settledRef.current = true;
    clearCountdown();
    clearFinishTimer();
    stopScan();
    setPhase(null);
    const deviceName =
      bleMatchRef.current?.name ?? classicMatchRef.current?.name ?? (target.vehicleName || 'OBD2');
    onEnd(reason, target, deviceName);
  }, [clearCountdown, clearFinishTimer, onEnd, stopScan, target]);

  const goToDashboard = useCallback((deviceName: string) => {
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('OBDDashboard', {
      vehicleId: target.vehicleId,
      vehicleName: target.vehicleName,
      deviceName,
      consumptionOfficial: null,
    });
  }, [target.vehicleId, target.vehicleName]);

  const requestCancel = useCallback(() => {
    if (settledRef.current) return;
    abortRequestedRef.current = true;
    clearCountdown();
    stopScan();

    if (phase === 'connecting') {
      setPhase('canceling');
      // Rà soát 30/7 (kẽ hở: finishConnect() có thể đã claim khoá mềm
      // deviceLock TRƯỚC khi cờ huỷ này kịp lan tới - claim() chạy fire-and-
      // forget, không có checkpoint isAborted() nào chặn được sau khi request
      // đã bắn đi). Trước đây gọi thẳng bleService.disconnect() - chỉ ngắt kết
      // nối BLE, không release() khoá, để lại khoá "treo" trên server tới khi
      // tự hết hạn (2 lần renew thiếu ~180s, xem DEVICE_LOCK_RENEW_INTERVAL_MS
      // trong useObd.ts). Đổi sang gọi disconnect() đầy đủ của hook - vừa ngắt
      // BLE vừa release() khoá ngay nếu nó đã lỡ được claim, thay vì chờ hết hạn.
      void disconnect().catch(() => {});
      clearFinishTimer();
      finishTimerRef.current = setTimeout(() => finish('dismissed'), 900);
      return;
    }

    finish('dismissed');
  }, [clearCountdown, clearFinishTimer, disconnect, finish, phase, stopScan]);

  const connectNow = useCallback(async (manual: boolean) => {
    if (settledRef.current || connectingRef.current) return;

    const deviceName =
      bleMatchRef.current?.name ??
      classicMatchRef.current?.name ??
      (target.vehicleName || 'OBD2');

    connectingRef.current = true;
    setPhase('connecting');
    clearCountdown();

    try {
      const ok =
        target.transport === 'classic'
          ? classicMatchRef.current
            ? await connectClassic(
                classicMatchRef.current.address,
                classicMatchRef.current.name,
                { shouldAbort: () => abortRequestedRef.current },
              )
            : false
          : bleMatchRef.current
            ? await connect(bleMatchRef.current.id, { shouldAbort: () => abortRequestedRef.current })
            : false;

      if (abortRequestedRef.current) {
        if (!settledRef.current) finish('dismissed');
        return;
      }

      if (!ok) {
        finish('failed');
        return;
      }

      // Chỉ tự điều hướng khỏi màn hình hiện tại khi user CHỦ ĐỘNG bấm "Kết
      // nối ngay" - nếu là đếm ngược tự chạy hết thì không được kéo user ra
      // khỏi việc họ đang làm, chỉ báo bằng banner nhỏ + cho họ tự bấm mở.
      if (manual) {
        goToDashboard(deviceName);
        finish('completed');
      } else {
        finish('completed-silent');
      }
    } catch {
      if (!abortRequestedRef.current) finish('failed');
    } finally {
      connectingRef.current = false;
    }
  }, [clearCountdown, connect, connectClassic, finish, goToDashboard, target.transport, target.vehicleName]);

  const dismissPrompt = useCallback(() => {
    if (phase === 'connecting' || phase === 'canceling') {
      requestCancel();
      return;
    }
    finish('dismissed');
  }, [finish, phase, requestCancel]);

  const disableAutoConnect = useCallback(() => {
    void setAutoConnect(target.vehicleId, false).catch(() => {});
    finish('dismissed');
  }, [finish, target.vehicleId]);

  useEffect(() => {
    if (phase !== 'countdown' || settledRef.current) return;
    setSecondsLeft(AUTO_CONNECT_COUNTDOWN_SECONDS);
    clearCountdown();
    countdownTimerRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          clearCountdown();
          void connectNow(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return clearCountdown;
  }, [clearCountdown, connectNow, phase]);

  useEffect(() => {
    if (target.transport !== 'classic' || settledRef.current) return;
    let cancelled = false;

    NotedriBtPairing.discoverDevices()
      .then((found) => {
        if (cancelled || settledRef.current) return;
        const match = found.find((d) => d.address === target.deviceId);
        if (!match) {
          finish('failed');
          return;
        }
        classicMatchRef.current = match;
        setPhase('countdown');
      })
      .catch(() => {
        if (!cancelled) finish('failed');
      });

    return () => {
      cancelled = true;
    };
  }, [finish, target.deviceId, target.transport]);

  useEffect(() => {
    if (target.transport !== 'ble' || settledRef.current) return;

    startScan(false);
    const timeout = setTimeout(() => finish('failed'), BLE_ATTEMPT_TIMEOUT_MS);
    return () => {
      clearTimeout(timeout);
      stopScan();
    };
  }, [finish, startScan, stopScan, target.transport]);

  useEffect(() => {
    if (target.transport !== 'ble' || settledRef.current || phase !== null) return;
    const match = foundDevices.find((d) => d.id === target.deviceId);
    if (!match) return;
    bleMatchRef.current = match;
    stopScan();
    setPhase('countdown');
  }, [foundDevices, phase, stopScan, target.deviceId, target.transport]);

  useEffect(() => {
    if (connectionState === 'error') {
      finish('failed');
    }
  }, [connectionState, finish]);

  useEffect(() => () => {
    clearCountdown();
    clearFinishTimer();
  }, [clearCountdown, clearFinishTimer]);

  // Không dùng <Modal> nữa (24/7 rà soát: Modal chặn touch TOÀN màn hình, user
  // không chuyển tab/thao tác gì khác được trong lúc đếm ngược/đang kết nối -
  // đúng phàn nàn "lúc nào cũng kết nối, không ra màn hình khác được"). Sheet
  // giờ là overlay không chặn (pointerEvents box-none ở ngoài), user vẫn dùng
  // app bình thường bên dưới; back cứng Android vẫn coi như bấm Đóng.
  useEffect(() => {
    if (phase === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismissPrompt();
      return true;
    });
    return () => sub.remove();
  }, [dismissPrompt, phase]);

  if (phase === null) return null;

  const deviceName =
    bleMatchRef.current?.name ??
    classicMatchRef.current?.name ??
    (target.vehicleName || 'OBD2');
  const progressWidth = phase === 'countdown'
    ? Math.max(15, (secondsLeft / AUTO_CONNECT_COUNTDOWN_SECONDS) * 100)
    : 100;
  const title =
    phase === 'connecting'
      ? t('obd.auto_connect_prompt_connecting_title')
      : phase === 'canceling'
        ? t('obd.auto_connect_prompt_canceling_title')
        : t('obd.auto_connect_prompt_title');
  const body =
    phase === 'connecting'
      ? t('obd.auto_connect_prompt_connecting_body', { name: deviceName })
      : phase === 'canceling'
        ? t('obd.auto_connect_prompt_canceling_body', { name: deviceName })
        : t('obd.auto_connect_prompt_body', { name: deviceName, seconds: secondsLeft });

  return (
    <View style={styles.sheetOverlay} pointerEvents="box-none">
      <View style={styles.sheetCard}>
        <View style={styles.dragHandle} />

          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <FontAwesome5 name="bolt" size={11} color="#3B82F6" />
              <Text style={styles.badgeText}>{t('obd.auto_connect_prompt_badge')}</Text>
            </View>
            <TouchableOpacity onPress={dismissPrompt} style={styles.iconBtn}>
              <FontAwesome5 name="times" size={13} color="#CBD5E1" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroRow}>
            <View style={styles.iconWrap}>
              <FontAwesome5
                name={phase === 'connecting' || phase === 'canceling' ? 'bluetooth-b' : 'car'}
                size={22}
                color="#3B82F6"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.body}>{body}</Text>
            </View>
          </View>

          {phase === 'countdown' && (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressWidth}%` }]} />
              </View>
              <Text style={styles.hint}>
                {t('obd.auto_connect_prompt_hint', { vehicle: target.vehicleName })}
              </Text>
            </>
          )}

          {phase === 'connecting' && (
            <View style={styles.inlineStateRow}>
              <ActivityIndicator color="#3B82F6" />
              <Text style={styles.connectingText}>
                {t('obd.auto_connect_prompt_connecting_cta')}
              </Text>
            </View>
          )}

          {phase === 'canceling' && (
            <View style={styles.inlineStateRow}>
              <ActivityIndicator color="#F59E0B" />
              <Text style={styles.connectingText}>
                {t('obd.auto_connect_prompt_canceling_cta')}
              </Text>
            </View>
          )}

          <View style={styles.actionsStack}>
            {phase === 'countdown' && (
              <>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => connectNow(true)}>
                  <Text style={styles.primaryBtnText}>{t('obd.auto_connect_prompt_connect')}</Text>
                </TouchableOpacity>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={dismissPrompt}>
                    <Text style={styles.secondaryBtnText}>{t('common.close')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.linkBtn} onPress={disableAutoConnect}>
                    <Text style={styles.linkBtnText}>{t('obd.auto_connect_prompt_disable')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {phase === 'connecting' && (
              <TouchableOpacity style={styles.dangerBtn} onPress={requestCancel}>
                <Text style={styles.dangerBtnText}>{t('obd.auto_connect_prompt_cancel')}</Text>
              </TouchableOpacity>
            )}

            {phase === 'canceling' && (
              <TouchableOpacity style={[styles.secondaryBtn, styles.secondaryBtnWide]} onPress={dismissPrompt}>
                <Text style={styles.secondaryBtnText}>{t('common.close')}</Text>
              </TouchableOpacity>
            )}
          </View>
      </View>
    </View>
  );
}

export default function ObdAutoConnect() {
  const t = useT();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const token = useAuthStore((s) => s.token);
  // Công tắc toàn cục (30/7, xem obdAutoConnectSettingsStore.ts) - tắt ở Cài
  // đặt là dừng hẳn, không phụ thuộc xe nào đã bật autoConnect riêng.
  const autoConnectMasterEnabled = useObdAutoConnectSettingsStore((s) => s.enabled);
  const sessionSuppressed = useObdAutoConnectSettingsStore((s) => s.sessionSuppressed);
  const [target, setTarget] = useState<AttemptTarget | null>(null);
  const [notice, setNotice] = useState<AutoConnectNotice | null>(null);
  const lastAttemptAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNoticeTimer = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, []);

  const showNotice = useCallback((next: AutoConnectNotice) => {
    clearNoticeTimer();
    setNotice(next);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, 7000);
  }, [clearNoticeTimer]);

  const handleAttemptEnd = useCallback((
    reason: AutoConnectEndReason,
    endedTarget: AttemptTarget,
    deviceName: string,
  ) => {
    // Rà soát 30/7 (user: bấm X thì chỉ cần dừng và quay lại màn hình hiện tại,
    // không cần thông báo "tạm dừng" gì thêm - Home đã sẵn thẻ "Kết nối OBD2" để
    // user tự bấm nếu muốn). Trước đây nhớ dismissedPairingRef + hiện banner
    // "paused" - vừa thêm 1 lớp thông báo không cần thiết, vừa khiến lần mở app
    // KẾ TIẾP (vd tắt máy xe rồi nổ lại) không tự thử auto-connect nữa mà bị
    // banner đó chặn cho tới khi user tự bấm "Thử lại". Giờ dismissed = im lặng
    // hoàn toàn, lần sau mở app/quay lại foreground sẽ tự thử auto-connect như
    // bình thường (vẫn tôn trọng cooldown 60s).
    if (reason === 'completed-silent') {
      // Đếm ngược tự chạy xong (user không chạm gì) - KHÔNG kéo user khỏi màn
      // hình họ đang dùng dở, chỉ báo bằng banner nhỏ, để họ tự bấm mở nếu muốn.
      showNotice({
        kind: 'connected',
        vehicleId: endedTarget.vehicleId,
        vehicleName: endedTarget.vehicleName,
        deviceName,
      });
    }
    setTarget(null);
  }, [showNotice]);

  const openConnectedDashboard = useCallback((n: AutoConnectNotice) => {
    clearNoticeTimer();
    setNotice(null);
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('OBDDashboard', {
      vehicleId: n.vehicleId,
      vehicleName: n.vehicleName,
      deviceName: n.deviceName,
      consumptionOfficial: null,
    });
  }, [clearNoticeTimer]);

  const tryAutoConnect = useCallback(async () => {
    if (!isPremium || !token) return;
    if (!autoConnectMasterEnabled) return;
    // User vừa chủ động bấm "Ngắt kết nối" trong phiên này - tôn trọng ý định đó
    // cho tới khi họ tắt hẳn app và mở lại (sessionSuppressed KHÔNG persist, xem
    // obdAutoConnectSettingsStore.ts), thay vì mời kết nối lại ngay khi họ đổi
    // màn hình/quay lại foreground.
    if (sessionSuppressed) return;
    if (target) return;
    if (Date.now() - lastAttemptAtRef.current < COOLDOWN_MS) return;
    if (bleService.isConnected()) return;

    const routeName = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
    if (routeName && SKIP_ON_ROUTES.has(routeName)) return;

    const defaultVehicle = await resolveDefaultVehicle();
    const pairing = await getAutoConnectPairing(defaultVehicle?.id);
    if (!pairing) return;

    const btState = await bleService.getBluetoothState();
    if (btState !== BleAdapterState.PoweredOn) return;
    const hasPerms = await bleService.hasScanPermissions();
    if (!hasPerms) return;

    lastAttemptAtRef.current = Date.now();
    setTarget({
      vehicleId: pairing.vehicleId,
      vehicleName: pairing.vehicleName,
      deviceId: pairing.bleDeviceId,
      transport: pairing.transport ?? 'ble',
    });
  }, [autoConnectMasterEnabled, isPremium, sessionSuppressed, target, token]);

  const scheduleAutoConnect = useCallback(() => {
    if (target) return;
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      void tryAutoConnect();
    }, INITIAL_ATTEMPT_DELAY_MS);
  }, [tryAutoConnect]);

  useEffect(() => {
    setTarget(null);
    setNotice(null);
    lastAttemptAtRef.current = 0;
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    clearNoticeTimer();
  }, [token]);

  useEffect(() => {
    scheduleAutoConnect();
    return () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    };
  }, [autoConnectMasterEnabled, isPremium, scheduleAutoConnect, token]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        scheduleAutoConnect();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [scheduleAutoConnect]);

  useEffect(() => () => {
    clearNoticeTimer();
  }, [clearNoticeTimer]);

  if (!target && !notice) return null;
  return (
    <>
      {target ? (
        <AutoConnectPrompt target={target} onEnd={handleAttemptEnd} />
      ) : (
        <View style={styles.noticeWrap} pointerEvents="box-none">
          <View style={styles.noticeCard}>
            <View style={styles.noticeIcon}>
              <FontAwesome5 name="check-circle" size={14} color="#4ADE80" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>{t('obd.auto_connect_connected_title')}</Text>
              <Text style={styles.noticeBody}>
                {t('obd.auto_connect_connected_body', { name: notice?.deviceName ?? 'OBD2' })}
              </Text>
            </View>
            <TouchableOpacity style={styles.noticeBtn} onPress={() => notice && openConnectedDashboard(notice)}>
              <Text style={styles.noticeBtnText}>{t('obd.auto_connect_connected_open')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  sheetCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: 28,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18,
  },
  dragHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.38)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  badgeText: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginTop: 16,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'left',
  },
  body: {
    color: '#CBD5E1',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'left',
    marginTop: 10,
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.16)',
    overflow: 'hidden',
    marginTop: 16,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#3B82F6',
  },
  hint: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'left',
    marginTop: 10,
  },
  inlineStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  actionsStack: {
    marginTop: 16,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  dangerBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  linkBtn: {
    flexShrink: 0,
    minHeight: 46,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  linkBtnText: {
    color: '#93C5FD',
    fontSize: 12.5,
    fontWeight: '700',
  },
  secondaryBtnWide: {
    flex: 0,
    width: '100%',
  },
  connectingText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    alignItems: 'center',
  },
  noticeCard: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.34)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  noticeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  noticeTitle: {
    color: '#F8FAFC',
    fontSize: 13.5,
    fontWeight: '800',
  },
  noticeBody: {
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  noticeBtn: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
  },
  noticeBtnText: {
    color: '#BFDBFE',
    fontSize: 12,
    fontWeight: '800',
  },
});
