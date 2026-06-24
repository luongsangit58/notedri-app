import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useObdConnection } from '../../hooks/useObd';
import { useColors } from '../../utils/theme';

export default function OBDSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;

  const colors = useColors();
  const {
    connectionState,
    foundDevices,
    errorMessage,
    startScan,
    stopScan,
    connect,
  } = useObdConnection(vehicleId);

  useEffect(() => {
    startScan();
    return () => stopScan();
  }, []);

  async function handleConnect(deviceId: string, deviceName: string) {
    stopScan();
    await connect(deviceId);
    navigation.replace('OBDDashboard', { vehicleId, deviceName });
  }

  const isScanning = connectionState === 'scanning';
  const isConnecting = connectionState === 'connecting';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Ket noi OBD</Text>
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
              ? 'Dang ket noi...'
              : isScanning
              ? 'Dang tim thiet bi OBD...'
              : foundDevices.length === 0
              ? 'Chua tim thay thiet bi'
              : `Tim thay ${foundDevices.length} thiet bi`}
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
            keyExtractor={(item) => item.id}
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
            onPress={startScan}
          >
            <FontAwesome5 name="sync" size={14} color="#3B82F6" />
            <Text style={[styles.scanBtnText, { color: '#3B82F6' }]}>Quet lai</Text>
          </TouchableOpacity>
        )}

        {/* Hint */}
        <View style={[styles.hintCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.hintTitle, { color: colors.text }]}>Huong dan</Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            1. Cam adapter BLE ELM327 vao cong OBD tren xe (thuong o goc lai, duoi dashboard)
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            2. No may xe (hoac bat contact)
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            3. Bat Bluetooth tren dien thoai va nhan "Quet lai"
          </Text>
          <Text style={[styles.hintText, { color: colors.textSecondary }]}>
            Khuyen dung: Vgate iCar Pro BLE, VEEPEAK Mini BLE
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
  hintCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 6,
  },
  hintTitle: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  hintText: { fontSize: 13, lineHeight: 20 },
});
