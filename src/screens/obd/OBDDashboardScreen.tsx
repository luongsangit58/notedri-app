import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useObdConnection } from '../../hooks/useObd';
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
    disconnect,
    startTrip,
    stopTrip,
  } = useObdConnection(vehicleId);

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

  const snap = liveSnapshot;
  const isConnected = connectionState === 'connected';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>OBD Live</Text>
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
            { backgroundColor: isConnected ? '#DCFCE7' : '#FEE2E2' },
          ]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? '#22C55E' : '#EF4444' },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: isConnected ? '#15803D' : '#B91C1C' },
            ]}
          >
            {isConnected ? t('obd.connected') : t('obd.disconnected')}
          </Text>
        </View>

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

        {/* Live stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <StatBox label={t('obd.stat_speed')} value={snap?.speedKmh ?? null} unit=" km/h" icon="tachometer-alt" color="#3B82F6" />
            <StatBox label="RPM" value={snap?.rpm !== null ? Math.round(snap?.rpm ?? 0) : null} icon="cogs" color="#8B5CF6" />
          </View>
          <View style={styles.statsRow}>
            <StatBox label={t('obd.stat_engine_load')} value={snap?.engineLoadPct ?? null} unit="%" icon="fire" color="#F59E0B" />
            <StatBox label={t('obd.stat_coolant')} value={snap?.coolantTempC ?? null} unit="°C" icon="thermometer-half" color="#EF4444" />
          </View>
          <View style={styles.statsRow}>
            <StatBox label={t('obd.stat_fuel')} value={snap?.fuelLevelPct ?? null} unit="%" icon="gas-pump" color="#10B981" />
            <StatBox label={t('obd.stat_oil_temp')} value={snap?.oilTempC ?? null} unit="°C" icon="oil-can" color="#F97316" />
          </View>
        </View>

        {/* Trip history link */}
        <TouchableOpacity
          style={[styles.historyBtn, { backgroundColor: colors.card }]}
          onPress={() => navigation.navigate('OBDTrips', { vehicleId, vehicleName, consumptionOfficial })}>
          <FontAwesome5 name="route" size={14} color={colors.primary} />
          <Text style={[styles.historyBtnText, { color: colors.primary }]}>{t('obd.trip_history')}</Text>
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
