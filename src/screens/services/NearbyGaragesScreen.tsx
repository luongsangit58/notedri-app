import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useRoute } from '@react-navigation/native';
import * as Location from 'expo-location';
import { FontAwesome5 } from '@expo/vector-icons';
import { nearbyApi } from '../../api/nearby';
import { PermissionManager } from '../../services/permissions/PermissionManager';
import { useColors } from '../../utils/theme';
import { contentWide } from '../../utils/layout';
import { useT } from '../../i18n';

type Place = {
  name?: string;
  addr?: string;
  dist?: number | string;
  lat?: number;
  lon?: number;
  phone?: string;
  loai?: string;
};

type ScreenState = 'idle' | 'requesting' | 'loading' | 'success' | 'permission_denied' | 'error';
type Mode = 'garage' | 'dangkiem';

const LOAI_FILTERS: { key: string; labelKey: string }[] = [
  { key: '', labelKey: 'nearby_garages.filter_all' },
  { key: 'oto', labelKey: 'nearby_garages.filter_oto' },
  { key: 'xe_may', labelKey: 'nearby_garages.filter_xe_may' },
  { key: 'rua_xe', labelKey: 'nearby_garages.filter_rua_xe' },
  { key: 'lop_xe', labelKey: 'nearby_garages.filter_lop_xe' },
];

function openGoogleMapsDirections(lat: number, lon: number) {
  Linking.openURL(`google.navigation:q=${lat},${lon}`).catch(() => {
    Linking.openURL(`https://maps.google.com/maps?daddr=${lat},${lon}`);
  });
}

export default function NearbyGaragesScreen() {
  const colors = useColors();
  const t = useT();
  const route = useRoute<any>();
  const paramLat: number | undefined = route.params?.latitude;
  const paramLng: number | undefined = route.params?.longitude;
  const [mode, setMode] = useState<Mode>(route.params?.mode === 'dangkiem' ? 'dangkiem' : 'garage');
  const isGarage = mode === 'garage';
  const accent = isGarage ? colors.primary : '#f59e0b';

  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [places, setPlaces] = useState<Place[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loai, setLoai] = useState('');

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    toggleBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    toggleBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    },
    toggleBtnActive: { backgroundColor: accent, borderColor: accent },
    toggleText: { fontSize: 13, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    statusText: { color: colors.textSecondary, marginTop: 16, fontSize: 15, textAlign: 'center' },
    bigIconWrap: { marginBottom: 16 },
    errorTitle: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
    errorBody: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    retryButton: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
    retryText: { color: colors.primaryText, fontWeight: '700', fontSize: 15 },
    listHeader: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
    card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14 },
    cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    stationIconWrap: { marginTop: 2, width: 26, alignItems: 'center', justifyContent: 'flex-start' },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginBottom: 6 },
    cardContent: { flex: 1 },
    stationName: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4, lineHeight: 20 },
    stationAddress: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, flex: 1 },
    distanceBadge: {
      backgroundColor: colors.textSecondary + '22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
      alignSelf: 'flex-start', minWidth: 50, alignItems: 'center',
    },
    distanceText: { color: colors.text, fontWeight: '700', fontSize: 12 },
    filterChip: {
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    filterChipActive: { backgroundColor: accent, borderColor: accent },
    filterChipText: { fontSize: 12.5, fontWeight: '700', color: colors.text },
    filterChipTextActive: { color: colors.primaryText },
  });

  const fetchNearby = useCallback(async () => {
    setErrorMsg('');
    try {
      let latitude: number;
      let longitude: number;
      if (paramLat != null && paramLng != null) {
        setScreenState('loading');
        latitude = paramLat;
        longitude = paramLng;
      } else {
        setScreenState('requesting');
        const { granted } = await PermissionManager.requestLocationForeground();
        if (!granted) {
          setScreenState('permission_denied');
          return;
        }
        setScreenState('loading');
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        latitude = loc.coords.latitude;
        longitude = loc.coords.longitude;
      }

      const res: any = isGarage
        ? await nearbyApi.garages(latitude, longitude, loai || undefined)
        : await nearbyApi.dangKiem(latitude, longitude);
      const raw = isGarage ? res?.data?.garages : res?.data?.centers;
      setPlaces(Array.isArray(raw) ? raw : []);
      setScreenState('success');
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? t('nearby_garages.load_failed');
      setErrorMsg(msg);
      setScreenState('error');
    }
  }, [paramLat, paramLng, isGarage, loai]);

  useEffect(() => {
    fetchNearby();
  }, [fetchNearby]);

  const getPlaceName = (p: Place) =>
    p.name ?? (isGarage ? t('nearby_garages.default_name_garage') : t('nearby_garages.default_name_dangkiem'));
  const formatDistance = (d?: number | string) => {
    if (d == null) return null;
    const m = typeof d === 'string' ? parseFloat(d) : d;
    if (isNaN(m)) return null;
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  };

  const renderPlace = ({ item }: { item: Place }) => {
    const name = getPlaceName(item);
    const dist = formatDistance(item.dist);
    const hasCoords = item.lat != null && item.lon != null;

    return (
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={styles.stationIconWrap}>
            <FontAwesome5 name={isGarage ? 'wrench' : 'clipboard-check'} size={20} color={accent} solid />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.stationName} numberOfLines={2}>{name}</Text>
            {!!item.addr && (
              <View style={styles.addressRow}>
                <FontAwesome5 name="map-marker-alt" size={12} color={colors.textSecondary} />
                <Text style={styles.stationAddress} numberOfLines={2}> {item.addr}</Text>
              </View>
            )}
          </View>
          {dist ? (
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceText}>{dist}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {hasCoords && (
            <TouchableOpacity
              onPress={() => openGoogleMapsDirections(item.lat as number, item.lon as number)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1a73e8' }}>
              <FontAwesome5 name="directions" size={13} color="#fff" solid />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{t('nearby_garages.directions')}</Text>
            </TouchableOpacity>
          )}
          {!!item.phone && (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${item.phone}`)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: accent }}>
              <FontAwesome5 name="phone" size={13} color={colors.primaryText} solid />
              <Text style={{ color: colors.primaryText, fontSize: 13, fontWeight: '700' }}>{t('nearby_garages.call')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const LoaiFilters = () => (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {LOAI_FILTERS.map((f) => {
        const active = loai === f.key;
        return (
          <TouchableOpacity
            key={f.key || 'all'}
            onPress={() => setLoai(f.key)}
            style={[styles.filterChip, active && styles.filterChipActive]}
            activeOpacity={0.85}>
            <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{t(f.labelKey as any)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderContent = () => {
    if (screenState === 'requesting' || screenState === 'idle') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>{t('nearby_garages.getting_location')}</Text>
        </View>
      );
    }

    if (screenState === 'loading') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>
            {isGarage ? t('nearby_garages.searching_garage') : t('nearby_garages.searching_dangkiem')}
          </Text>
        </View>
      );
    }

    if (screenState === 'permission_denied') {
      return (
        <View style={styles.center}>
          <View style={styles.bigIconWrap}>
            <FontAwesome5 name="map-marker-alt" size={40} color={colors.warning} solid />
          </View>
          <Text style={styles.errorTitle}>{t('nearby_garages.permission_title')}</Text>
          <Text style={styles.errorBody}>
            {isGarage ? t('nearby_garages.permission_desc_garage') : t('nearby_garages.permission_desc_dangkiem')}
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
          <Text style={styles.errorTitle}>{t('nearby_garages.error_title')}</Text>
          <Text style={styles.errorBody}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (screenState === 'success' && places.length === 0) {
      return (
        <View style={styles.center}>
          <View style={styles.bigIconWrap}>
            <FontAwesome5 name="search" size={40} color={colors.textSecondary} solid />
          </View>
          <Text style={styles.errorTitle}>{t('nearby_garages.empty_title')}</Text>
          <Text style={styles.errorBody}>
            {isGarage ? t('nearby_garages.empty_subtitle_garage') : t('nearby_garages.empty_subtitle_dangkiem')}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNearby}>
            <Text style={styles.retryText}>{t('nearby_garages.reload')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={places}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderPlace}
        contentContainerStyle={[{ padding: 16 }, contentWide]}
        ListHeaderComponent={
          <>
            {isGarage ? <LoaiFilters /> : null}
            <Text style={styles.listHeader}>
              {isGarage
                ? t('nearby_garages.count_title_garage', { n: places.length })
                : t('nearby_garages.count_title_dangkiem', { n: places.length })}
            </Text>
          </>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    );
  };

  const ModeToggle = () => (
    <View style={styles.toggleBar}>
      {(['garage', 'dangkiem'] as const).map((m) => {
        const active = mode === m;
        return (
          <TouchableOpacity
            key={m}
            onPress={() => { if (mode !== m) { setPlaces([]); setLoai(''); setMode(m); } }}
            style={[styles.toggleBtn, active && styles.toggleBtnActive]}
            activeOpacity={0.85}>
            <FontAwesome5
              name={m === 'garage' ? 'wrench' : 'clipboard-check'}
              size={13}
              color={active ? colors.primaryText : colors.textSecondary}
              solid
            />
            <Text style={[styles.toggleText, { color: active ? colors.primaryText : colors.textSecondary }]}>
              {m === 'garage' ? t('nearby_garages.tab_garage') : t('nearby_garages.tab_dangkiem')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <ModeToggle />
      {renderContent()}
    </SafeAreaView>
  );
}
