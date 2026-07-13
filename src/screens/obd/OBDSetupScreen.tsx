import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useObdConnection } from '../../hooks/useObd';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

export default function OBDSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';
  const consumptionOfficial: number | null = route.params?.consumptionOfficial ?? null;
  // Đến từ chạm NFC (xem NfcService/App.tsx deep link listener) - biết trước đúng
  // thiết bị BLE cần kết nối nên bỏ qua bước user tự chọn trong danh sách quét.
  const autoConnectDeviceId: string | null = route.params?.autoConnectDeviceId ?? null;

  const t = useT();
  const colors = useColors();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const userSynced = useAuthStore((s) => s.userSynced);
  const {
    connectionState,
    foundDevices,
    errorMessage,
    startScan,
    stopScan,
    connect,
  } = useObdConnection(vehicleId, vehicleName);

  // Guard: redirect to PremiumScreen if user is not premium. Đợi userSynced để không đá nhầm
  // user Premium thật ra màn nâng cấp chỉ vì cache lúc cold-start chưa kịp làm mới is_premium.
  useEffect(() => {
    if (userSynced && !isPremium) {
      navigation.replace('Premium');
    }
  }, [userSynced, isPremium]);

  // Toggle "hiện tất cả thiết bị": một số adapter quảng bá tên lạ (không chứa
  // OBD/ELM/VLINK...) sẽ bị bộ lọc mặc định bỏ qua - bật lên để hiện mọi thiết bị BLE có tên.
  const [showAllDevices, setShowAllDevices] = useState(false);

  useEffect(() => {
    if (!isPremium) return;
    startScan(showAllDevices);
    return () => stopScan();
  }, [isPremium, showAllDevices]);

  async function handleConnect(deviceId: string, deviceName: string) {
    stopScan();
    await connect(deviceId);
    navigation.replace('OBDDashboard', { vehicleId, vehicleName, deviceName, consumptionOfficial });
  }

  // One Tap Connect: tự bấm connect ngay khi quét thấy đúng thiết bị đã ghép NFC,
  // không chờ user chạm vào danh sách.
  useEffect(() => {
    if (!autoConnectDeviceId || connectionState !== 'scanning') return;
    const match = foundDevices.find((d) => d.id === autoConnectDeviceId);
    if (match) handleConnect(match.id, match.name);
  }, [autoConnectDeviceId, foundDevices, connectionState]);

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('obd.setup_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.body}>
        {/* Status indicator */}
        <View style={[styles.statusCard, { backgroundColor: colors.card }]}>
          <FontAwesome5
            name="bluetooth-b"
            size={32}
            color={isScanning || isConnecting ? '#3B82F6' : colors.textSecondary}
          />
          <Text style={[styles.statusText, { color: colors.text }]}>
            {isConnecting
              ? t('obd.connecting')
              : isScanning
              ? t('obd.scanning')
              : foundDevices.length === 0
              ? t('obd.no_device_found')
              : t('obd.devices_found', { n: foundDevices.length })}
          </Text>
          {(isScanning || isConnecting) && (
            <ActivityIndicator color="#3B82F6" style={{ marginTop: 8 }} />
          )}
          {errorMessage && (
            <Text style={styles.errorText}>{errorMessage}</Text>
          )}
        </View>

        {/* Device list */}
        {foundDevices.length > 0 && (
          <FlatList
            data={foundDevices}
            keyExtractor={(item, index) => item.id ?? `device-${index}`}
            style={{ marginTop: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.deviceRow, { backgroundColor: colors.card }]}
                onPress={() => handleConnect(item.id, item.name)}
                disabled={isConnecting}
              >
                <FontAwesome5 name="car" size={16} color="#3B82F6" />
                <Text style={[styles.deviceName, { color: colors.text }]}>
                  {item.name}
                </Text>
                <FontAwesome5 name="chevron-right" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          />
        )}

        {/* Retry scan */}
        {!isScanning && !isConnecting && (
          <TouchableOpacity
            style={[styles.scanBtn, { borderColor: '#3B82F6' }]}
            onPress={() => startScan(showAllDevices)}
          >
            <FontAwesome5 name="sync" size={14} color="#3B82F6" />
            <Text style={[styles.scanBtnText, { color: '#3B82F6' }]}>{t('obd.scan_retry')}</Text>
          </TouchableOpacity>
        )}

        {/* Show-all toggle */}
        <View style={[styles.showAllRow, { backgroundColor: colors.card }]}>
          <Text style={[styles.showAllLabel, { color: colors.text }]}>
            {t('obd.show_all_devices')}
          </Text>
          <Switch
            value={showAllDevices}
            onValueChange={setShowAllDevices}
            disabled={isConnecting}
            trackColor={{ true: '#3B82F6' }}
          />
        </View>

        {/* Hint */}
        <View style={[styles.hintCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.hintTitle, { color: colors.text }]}>{t('obd.guide_title')}</Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('obd.guide_step1')}
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('obd.guide_step2')}
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('obd.guide_step3')}
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            {t('obd.guide_recommended')}
          </Text>
        </View>
      </View>
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
  body: { flex: 1, paddingHorizontal: 16 },
  statusCard: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  statusText: { fontSize: 15, fontWeight: '500', textAlign: 'center' },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginTop: 4 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  deviceName: { flex: 1, fontSize: 15, fontWeight: '500' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 16,
  },
  scanBtnText: { fontSize: 15, fontWeight: '600' },
  showAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 12,
  },
  showAllLabel: { fontSize: 14, fontWeight: '500' },
  hintCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 6,
  },
  hintTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  hintText: { fontSize: 13, lineHeight: 20 },
});
