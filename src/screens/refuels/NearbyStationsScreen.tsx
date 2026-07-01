import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { FontAwesome5 } from '@expo/vector-icons';
import { refuelsApi } from '../../api/refuels';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

type Station = {
  name?: string;
  ten?: string;
  address?: string;
  dia_chi?: string;
  distance?: number | string;
  lat?: number;
  lng?: number;
  lon?: number;
  power?: number;
  fuel_types?: string[];
};

type ScreenState = 'idle' | 'requesting' | 'loading' | 'success' | 'permission_denied' | 'error';

function openGoogleMapsDirections(lat: number, lng: number, _name: string) {
  if (Platform.OS === 'ios') {
    // Thử Apple Maps trước, fallback Google Maps web
    Linking.openURL(`maps://?daddr=${lat},${lng}`).catch(() => {
      Linking.openURL(`https://maps.google.com/maps?daddr=${lat},${lng}`);
    });
  } else {
    // google.navigation: mở thẳng Google Maps navigation mode (không cần canOpenURL)
    // canOpenURL luôn trả false trên Android 11+ nếu thiếu <queries> trong manifest
    Linking.openURL(`google.navigation:q=${lat},${lng}`).catch(() => {
      // Google Maps chưa cài -> fallback web
      Linking.openURL(`https://maps.google.com/maps?daddr=${lat},${lng}`);
    });
  }
}

export default function NearbyStationsScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation();
  const route = useRoute<any>();
  // standalone=true: không hiển thị nút "Chọn" về AddRefuel
  const standalone = route.params?.standalone !== false;
  // Coords passed from HomeScreen (already has GPS for weather) - skip redundant GPS acquisition
  const paramLat: number | undefined = route.params?.latitude;
  const paramLng: number | undefined = route.params?.longitude;
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [stations, setStations] = useState<Station[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  // 'fuel' = cây xăng (Overpass), 'charging' = trạm sạc EV (DB, nguồn VinFast/EVCS). Mặc định theo param, có toggle.
  const [mode, setMode] = useState<'fuel' | 'charging'>(route.params?.mode === 'charging' ? 'charging' : 'fuel');
  const isCharging = mode === 'charging';

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    toggleBar: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    toggleBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    toggleBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    toggleText: {
      fontSize: 13,
      fontWeight: '700',
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
      color: colors.primaryText,
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
      backgroundColor: colors.textSecondary + '22',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      alignSelf: 'flex-start',
      minWidth: 50,
      alignItems: 'center',
    },
    distanceText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
  });

  const fetchNearby = useCallback(async () => {
    setErrorMsg('');

    try {
      let latitude: number;
      let longitude: number;

      if (paramLat != null && paramLng != null) {
        // Coords pre-fetched by HomeScreen (weather GPS) - skip GPS acquisition
        setScreenState('loading');
        latitude = paramLat;
        longitude = paramLng;
      } else {
        setScreenState('requesting');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setScreenState('permission_denied');
          return;
        }
        setScreenState('loading');
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }

      const res: any = isCharging
        ? await refuelsApi.nearbyCharging(latitude, longitude)
        : await refuelsApi.nearbyStations(latitude, longitude);
      const raw = res?.data?.data ?? res?.data?.stations ?? res?.data ?? [];
      const list: Station[] = Array.isArray(raw) ? raw : [];
      setStations(list);
      setScreenState('success');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? t('nearby_stations.load_failed');
      setErrorMsg(msg);
      setScreenState('error');
    }
  }, [paramLat, paramLng, isCharging]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  const getStationName = (s: Station) =>
    s.name ?? s.ten ?? (isCharging ? t('nearby_stations.default_name_charging') : t('nearby_stations.default_name'));
  const getStationAddress = (s: any) => s.addr ?? s.address ?? s.dia_chi ?? '';
  // Backend trả `dist` tính bằng MÉT (int)
  const formatDistance = (d?: number | string) => {
    if (d == null) return null;
    const m = typeof d === 'string' ? parseFloat(d) : d;
    if (isNaN(m)) return null;
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  };

  const renderStation = ({ item }: { item: any; index: number }) => {
    const name = getStationName(item);
    const address = getStationAddress(item);
    const dist = formatDistance(item.dist ?? item.distance);
    const fuelTypes: string[] = Array.isArray(item.fuel_types) ? item.fuel_types : [];
    const power: number | undefined = isCharging && item.power ? Number(item.power) : undefined;
    // Cây xăng (Api/V1) trả `lng`; trạm sạc (ChargingStationService) trả `lon` -> nhận cả hai.
    const lngVal: number | undefined = item.lng ?? item.lon;
    const hasCoords = item.lat != null && lngVal != null;

    const onSelect = () => {
      const label = address ? `${name} - ${address}` : name;
      (navigation as any).navigate({ name: 'AddRefuel', params: { pickedStation: label }, merge: true });
    };

    // Đổ xăng nhanh: sang form AddRefuel với tên trạm điền sẵn (chỉ cây xăng).
    const onQuickRefuel = () => {
      const label = address ? `${name} - ${address}` : name;
      (navigation as any).navigate('AddRefuel', { pickedStation: label });
    };

    const onDirections = () => {
      if (hasCoords) {
        openGoogleMapsDirections(item.lat, lngVal as number, name);
      }
    };

    // Tap toàn card = dẫn đường (standalone) hoặc chọn trạm (AddRefuel flow)
    const onCardPress = standalone ? onDirections : onSelect;

    return (
      <TouchableOpacity style={styles.card} onPress={onCardPress} activeOpacity={0.85}>
        <View style={styles.cardRow}>
          <View style={styles.stationIconWrap}>
            <FontAwesome5 name={isCharging ? 'charging-station' : 'gas-pump'} size={20} color={colors.primary} solid />
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
            {power ? (
              <View style={styles.fuelRow}>
                <View style={styles.fuelChip}>
                  <Text style={styles.fuelChipText}>
                    <FontAwesome5 name="bolt" size={10} color={colors.textSecondary} solid /> {power} kW
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
          {dist ? (
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceText}>{dist}</Text>
            </View>
          ) : null}
        </View>
        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {hasCoords && (
            <TouchableOpacity
              onPress={onDirections}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1a73e8' }}>
              <FontAwesome5 name="directions" size={13} color="#fff" solid />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('nearby_stations.directions')}</Text>
            </TouchableOpacity>
          )}
          {/* Đổ xăng nhanh: chỉ cây xăng, khi mở trực tiếp (standalone). */}
          {!isCharging && standalone && (
            <TouchableOpacity
              onPress={onQuickRefuel}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}>
              <FontAwesome5 name="gas-pump" size={13} color={colors.primaryText} solid />
              <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '700' }}>{t('nearby_stations.quick_refuel')}</Text>
            </TouchableOpacity>
          )}
          {!standalone && (
            <TouchableOpacity
              onPress={onSelect}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <FontAwesome5 name="check" size={13} color={colors.text} solid />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{t('nearby_stations.select')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderContent = () => {
    if (screenState === 'requesting' || screenState === 'idle') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>{t('nearby_stations.getting_location')}</Text>
        </View>
      );
    }

    if (screenState === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>{isCharging ? t('nearby_stations.searching_charging') : t('nearby_stations.searching')}</Text>
        </View>
      );
    }

    if (screenState === 'permission_denied') {
      return (
        <View style={styles.center}>
          <View style={styles.bigIconWrap}>
            <FontAwesome5 name="map-marker-slash" size={40} color={colors.warning} solid />
          </View>
          <Text style={styles.errorTitle}>{t('nearby_stations.permission_title')}</Text>
          <Text style={styles.errorBody}>
            {t('nearby_stations.permission_desc')}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
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
          <Text style={styles.errorTitle}>{t('nearby_stations.error_title')}</Text>
          <Text style={styles.errorBody}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
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
          <Text style={styles.errorTitle}>{t('nearby_stations.empty_title')}</Text>
          <Text style={styles.errorBody}>{isCharging ? t('nearby_stations.empty_subtitle_charging') : t('nearby_stations.empty_subtitle')}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>{t('nearby_stations.reload')}</Text>
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
            {isCharging
              ? t('nearby_stations.count_title_charging', { n: stations.length })
              : t('nearby_stations.count_title', { n: stations.length })}
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    );
  };

  const ModeToggle = () => (
    <View style={styles.toggleBar}>
      {(['fuel', 'charging'] as const).map((m) => {
        const active = mode === m;
        return (
          <TouchableOpacity
            key={m}
            onPress={() => { if (mode !== m) { setStations([]); setMode(m); } }}
            style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            activeOpacity={0.85}>
            <FontAwesome5
              name={m === 'charging' ? 'charging-station' : 'gas-pump'}
              size={13}
              color={active ? colors.primaryText : colors.textSecondary}
              solid
            />
            <Text style={[styles.toggleText, { color: active ? colors.primaryText : colors.textSecondary }]}>
              {m === 'charging' ? t('nearby_stations.tab_charging') : t('nearby_stations.tab_fuel')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <AppBgPattern />
      <ModeToggle />
      {renderContent()}
    </SafeAreaView>
  );
}
