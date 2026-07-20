import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet,
  TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useServices } from '../../hooks/useServices';
import { useVehicles } from '../../hooks/useVehicles';
import { useColors } from '../../utils/theme';
import { normalizeSearch } from '../../utils/text';
import { contentWide } from '../../utils/layout';
import { formatVND } from '../../utils/format';
import { useT } from '../../i18n';

const LOAI_KEYS: Record<string, string> = {
  bao_duong: 'services.type_bao_duong',
  sua_chua: 'services.type_sua_chua',
  lop: 'services.type_lop',
  bao_hiem: 'reminders.type_bao_hiem',
  dang_kiem: 'reminders.type_dang_kiem',
  phat_nguoi: 'services.type_phat_nguoi',
  phi_gui_xe: 'services.type_phi_gui_xe',
  phi_cau_duong: 'services.type_phi_cau_duong',
  rua_xe: 'services.type_rua_xe',
  khac: 'reminders.type_khac',
};

const ALL_CHIP = 'tat_ca';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

interface ServiceItem {
  id: number;
  hang_muc: string;
  loai: string;
  ngay: string;
  chi_phi: number;
  noi_lam: string;
  odometer: number;
  ghi_chu: string;
  dinh_kem_url?: string | null;
}

function ServiceCard({ item, onPress }: { item: ServiceItem; onPress?: () => void }) {
  const colors = useColors();
  const t = useT();
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { justifyContent: 'center' as const, alignItems: 'center' as const, width: 28 },
    cardMain: { flex: 1 },
    hangMuc: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { backgroundColor: colors.primary + '28', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
    badgeText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
    ngay: { color: colors.textSecondary, fontSize: 12 },
    cardRight: { alignItems: 'flex-end' },
    chiPhi: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    noiLam: { color: colors.textSecondary, fontSize: 12, marginTop: 0 },
  });

  const loaiLabel = LOAI_KEYS[item.loai] ? t(LOAI_KEYS[item.loai] as any) : item.loai;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}>
          <FontAwesome5 name="wrench" size={18} color={colors.primary} solid />
        </View>
        <View style={styles.cardMain}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.hangMuc, { flexShrink: 1 }]} numberOfLines={1}>{item.hang_muc}</Text>
            {item.dinh_kem_url ? (
              <FontAwesome5 name="paperclip" size={11} color={colors.textSecondary} solid />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.badge}><Text style={styles.badgeText}>{loaiLabel}</Text></View>
            <Text style={styles.ngay}>{formatDate(item.ngay)}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          {item.chi_phi ? <Text style={styles.chiPhi}>{formatVND(item.chi_phi)}</Text> : null}
        </View>
      </View>
      {!!item.noi_lam && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <FontAwesome5 name="map-marker-alt" size={11} color={colors.textSecondary} solid />
          <Text style={styles.noiLam} numberOfLines={1}>{item.noi_lam}</Text>
        </View>
      )}
      {!!item.ghi_chu && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
          {item.ghi_chu}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function ServicesScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();

  const [searchText, setSearchText] = useState('');
  const [selectedLoai, setSelectedLoai] = useState<string>(ALL_CHIP);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | undefined>(undefined);

  const { data: vehiclesData } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesData?.data)
    ? vehiclesData.data
    : Array.isArray(vehiclesData) ? vehiclesData : [];

  React.useEffect(() => {
    if (vehicles.length > 0 && selectedVehicleId === undefined) {
      const def = vehicles.find((v: any) => v.is_default) ?? vehicles[0];
      setSelectedVehicleId(def.id);
    }
  }, [vehicles.length]);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    refetch,
  } = useServices(selectedVehicleId);

  const allItems: ServiceItem[] = data?.pages.flatMap((p: any) => p.data ?? p) ?? [];

  const filteredItems = useMemo(() => {
    let result = allItems;
    if (selectedLoai !== ALL_CHIP) result = result.filter(i => i.loai === selectedLoai);
    if (searchText.trim()) {
      const q = normalizeSearch(searchText);
      result = result.filter(i =>
        normalizeSearch(i.hang_muc ?? '').includes(q) ||
        normalizeSearch(i.noi_lam ?? '').includes(q) ||
        normalizeSearch(i.ghi_chu ?? '').includes(q),
      );
    }
    return result;
  }, [allItems, searchText, selectedLoai]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const firstPageMeta = data?.pages[0]?.meta ?? null;
  const totalCost: number = firstPageMeta?.total_cost ?? 0;
  const countWithCost: number = firstPageMeta?.count_with_cost ?? 0;

  const chipKeys = [ALL_CHIP, ...Object.keys(LOAI_KEYS)];

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
    searchInput: {
      backgroundColor: colors.surface, color: colors.text,
      borderRadius: 10, padding: 12, marginBottom: 8, fontSize: 14,
    },
    chipsContainer: { gap: 8, paddingBottom: 4 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '400' },
    chipTextActive: { color: colors.primaryText, fontWeight: '700' },
    listContent: { padding: 16, paddingBottom: 80 },
    emptyContainer: { flexGrow: 1, padding: 16, paddingBottom: 80 },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    fab: {
      position: 'absolute', right: 20, bottom: 28,
      width: 56, height: 56, borderRadius: 28,
      backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
      elevation: 6, shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 6,
    },
  });

  if (isLoading && allItems.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom', 'left', 'right']}>
        <AppBgPattern />
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[filteredItems.length === 0 ? styles.emptyContainer : styles.listContent, contentWide]}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isFetchingNextPage}
            onRefresh={refetch}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListHeaderComponent={
          <View style={{ paddingBottom: 8 }}>
            {/* Garage guide quick link */}
            <TouchableOpacity
              onPress={() => navigation.navigate('GarageGuide')}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: colors.primary + '15', borderRadius: 10, padding: 12, marginBottom: 12,
                borderWidth: 1, borderColor: colors.primary + '33',
              }}>
              <FontAwesome5 name="suitcase" size={14} color={colors.primary} solid />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>{t('garage_guide.title')}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>
                  {t('services.garage_desc')}
                </Text>
              </View>
              <FontAwesome5 name="chevron-right" size={11} color={colors.primary} />
            </TouchableOpacity>

            {/* Stats */}
            {totalCost > 0 && (
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 12 }}>
                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('services.total_cost')}</Text>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14, marginTop: 2 }}>
                    {formatVND(totalCost)}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center' }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{t('services.paid_count')}</Text>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, marginTop: 2 }}>{countWithCost}</Text>
                </View>
              </View>
            )}

            {/* Vehicle filter — only for multi-vehicle users */}
            {vehicles.length > 1 && (
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsContainer}
                style={{ marginBottom: 8 }}>
                {vehicles.map((v: any) => {
                  const active = v.id === selectedVehicleId;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => setSelectedVehicleId(v.id)}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{v.ten}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Search */}
            <TextInput
              style={styles.searchInput}
              placeholder={t('services.search_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={searchText}
              onChangeText={setSearchText}
              clearButtonMode="while-editing"
            />

            {/* Loại filter */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContainer}>
              {chipKeys.map((key) => {
                const active = key === selectedLoai;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setSelectedLoai(key)}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {key === ALL_CHIP ? t('common.all') : t(LOAI_KEYS[key] as any)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FontAwesome5 name="wrench" size={48} color={colors.textSecondary} solid />
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 6 }}>
              {searchText || selectedLoai !== ALL_CHIP ? t('services.no_results') : t('services.empty')}
            </Text>
            {!searchText && selectedLoai === ALL_CHIP && (
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('services.press_plus_add')}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ServiceCard
            item={item}
            onPress={() => navigation.navigate('EditService', { serviceId: item.id })}
          />
        )}
        ListFooterComponent={
          isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('AddService')} activeOpacity={0.85}>
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
