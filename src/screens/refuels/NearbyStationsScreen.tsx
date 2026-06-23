import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { FontAwesome5 } from '@expo/vector-icons';
import { refuelsApi } from '../../api/refuels';
import { colors } from '../../utils/colors';

type Station = {
  name?: string;
  ten?: string;
  address?: string;
  dia_chi?: string;
  distance?: number | string;
  lat?: number;
  lng?: number;
  fuel_types?: string[];
};

type ScreenState = 'idle' | 'requesting' | 'loading' | 'success' | 'permission_denied' | 'error';

export default function NearbyStationsScreen() {
  const navigation = useNavigation();
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [stations, setStations] = useState<Station[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchNearby = useCallback(async () => {
    setScreenState('requesting');
    setErrorMsg('');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setScreenState('permission_denied');
        return;
      }

      setScreenState('loading');
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;

      const res: any = await refuelsApi.nearbyStations(latitude, longitude);
      const raw = res?.data?.data ?? res?.data?.stations ?? res?.data ?? [];
      const list: Station[] = Array.isArray(raw) ? raw : [];
      setStations(list);
      setScreenState('success');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Không thể tải danh sách trạm';
      setErrorMsg(msg);
      setScreenState('error');
    }
  }, []);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  const getStationName = (s: Station) => s.name ?? s.ten ?? 'Trạm xăng';
  const getStationAddress = (s: Station) => s.address ?? s.dia_chi ?? '';
  const formatDistance = (d?: number | string) => {
    if (d == null) return null;
    const n = typeof d === 'string' ? parseFloat(d) : d;
    if (isNaN(n)) return null;
    if (n < 1) return `${Math.round(n * 1000)} m`;
    return `${n.toFixed(1)} km`;
  };

  const renderStation = ({ item, index }: { item: Station; index: number }) => {
    const name = getStationName(item);
    const address = getStationAddress(item);
    const dist = formatDistance(item.distance);
    const fuelTypes: string[] = Array.isArray(item.fuel_types) ? item.fuel_types : [];

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.stationIconWrap}>
            <FontAwesome5 name="gas-pump" size={20} color={colors.primary} solid />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.stationName} numberOfLines={2}>{name}</Text>
            {address ? (
              <View style={styles.addressRow}>
                <FontAwesome5 name="map-marker-alt" size={12} color={colors.textSecondary} />
                <Text style={styles.stationAddress} numberOfLines={2}> {address}</Text>
              </View>
            ) : null}
            {fuelTypes.length > 0 && (
              <View style={styles.fuelRow}>
                {fuelTypes.map((ft, i) => (
                  <View key={i} style={styles.fuelChip}>
                    <Text style={styles.fuelChipText}>{ft}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          {dist ? (
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceText}>{dist}</Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (screenState === 'requesting' || screenState === 'idle') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>Đang lấy vị trí của bạn...</Text>
        </View>
      );
    }

    if (screenState === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>Đang tìm trạm xăng gần đây...</Text>
        </View>
      );
    }

    if (screenState === 'permission_denied') {
      return (
        <View style={styles.center}>
          <View style={styles.bigIconWrap}>
            <FontAwesome5 name="map-marker-slash" size={40} color={colors.warning} solid />
          </View>
          <Text style={styles.errorTitle}>Cần quyền vị trí</Text>
          <Text style={styles.errorBody}>
            Vui lòng cho phép NoteDri truy cập vị trí để tìm trạm xăng gần bạn.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (screenState === 'error') {
      return (
        <View style={styles.center}>
          <View style={styles.bigIconWrap}>
            <FontAwesome5 name="exclamation-triangle" size={40} color={colors.warning} solid />
          </View>
          <Text style={styles.errorTitle}>Có lỗi xảy ra</Text>
          <Text style={styles.errorBody}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (screenState === 'success' && stations.length === 0) {
      return (
        <View style={styles.center}>
          <View style={styles.bigIconWrap}>
            <FontAwesome5 name="search" size={40} color={colors.textSecondary} solid />
          </View>
          <Text style={styles.errorTitle}>Không tìm thấy trạm nào</Text>
          <Text style={styles.errorBody}>Không có trạm xăng nào gần vị trí của bạn.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>Tải lại</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={stations}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderStation}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <Text style={styles.listHeader}>
            {stations.length} trạm xăng gần bạn
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {renderContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  statusText: {
    color: colors.textSecondary,
    marginTop: 16,
    fontSize: 15,
    textAlign: 'center',
  },
  bigIconWrap: {
    marginBottom: 16,
  },
  errorTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorBody: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  listHeader: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stationIconWrap: {
    marginTop: 2,
    width: 26,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  cardContent: {
    flex: 1,
  },
  stationName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 20,
  },
  stationAddress: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  fuelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  fuelChip: {
    backgroundColor: colors.card,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fuelChipText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  distanceBadge: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    minWidth: 50,
    alignItems: 'center',
  },
  distanceText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
});
