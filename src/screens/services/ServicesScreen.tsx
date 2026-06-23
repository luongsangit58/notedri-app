import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet,
  TextInput, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useServices } from '../../hooks/useServices';
import { colors } from '../../utils/colors';

const LOAI_LABELS: Record<string, string> = {
  bao_duong: 'Bảo dưỡng',
  sua_chua: 'Sửa chữa',
  lop: 'Lốp',
  bao_hiem: 'Bảo hiểm',
  dang_kiem: 'Đăng kiểm',
  phat_nguoi: 'Phạt nguội',
  phi_gui_xe: 'Phí gửi xe',
  phi_cau_duong: 'Phí cầu đường',
  rua_xe: 'Rửa xe',
  khac: 'Khác',
};

const ALL_CHIP = 'tat_ca';

function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

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
}

function ServiceCard({ item, onPress }: { item: ServiceItem; onPress?: () => void }) {
  const loaiLabel = LOAI_LABELS[item.loai] ?? item.loai;
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}>
          <FontAwesome5 name="wrench" size={18} color={colors.primary} solid />
        </View>
        <View style={styles.cardMain}>
          <Text style={styles.hangMuc} numberOfLines={1}>{item.hang_muc}</Text>
          <View style={styles.metaRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{loaiLabel}</Text>
            </View>
            <Text style={styles.ngay}>{formatDate(item.ngay)}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          {item.chi_phi ? (
            <Text style={styles.chiPhi}>{formatVND(item.chi_phi)}</Text>
          ) : null}
        </View>
      </View>
      {!!item.noi_lam && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
          <FontAwesome5 name="map-marker-alt" size={11} color={colors.textSecondary} solid />
          <Text style={[styles.noiLam, { marginTop: 0 }]} numberOfLines={1}>{item.noi_lam}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ServicesScreen() {
  const navigation = useNavigation<any>();
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, refetch } = useServices(undefined, page);

  const items: ServiceItem[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? (data as ServiceItem[])
    : [];

  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedLoai, setSelectedLoai] = useState<string>(ALL_CHIP);

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await refetch();
    setRefreshing(false);
  };

  const filteredItems = useMemo(() => {
    let result = items;

    if (selectedLoai !== ALL_CHIP) {
      result = result.filter((item) => item.loai === selectedLoai);
    }

    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase();
      result = result.filter(
        (item) =>
          (item.hang_muc ?? '').toLowerCase().includes(query) ||
          (item.noi_lam ?? '').toLowerCase().includes(query) ||
          (item.ghi_chu ?? '').toLowerCase().includes(query),
      );
    }

    return result;
  }, [items, searchText, selectedLoai]);

  if (isLoading && items.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const chipKeys = [ALL_CHIP, ...Object.keys(LOAI_LABELS)];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={filteredItems.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.filterHeader}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍 Tìm kiếm bảo dưỡng..."
              placeholderTextColor={colors.textSecondary}
              value={searchText}
              onChangeText={setSearchText}
              clearButtonMode="while-editing"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContainer}
            >
              {chipKeys.map((key) => {
                const active = key === selectedLoai;
                const label = key === ALL_CHIP ? 'Tất cả' : LOAI_LABELS[key];
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setSelectedLoai(key)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <FontAwesome5 name="wrench" size={48} color={colors.textSecondary} solid />
            </View>
            <Text style={styles.emptyText}>
              {searchText || selectedLoai !== ALL_CHIP
                ? 'Không có kết quả phù hợp'
                : 'Chưa có lịch sử bảo dưỡng'}
            </Text>
            {!searchText && selectedLoai === ALL_CHIP && (
              <Text style={styles.emptySubText}>Nhấn + để thêm lần bảo dưỡng đầu tiên</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ServiceCard
            item={item}
            onPress={() => navigation.navigate('EditService', { serviceId: item.id })}
          />
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddService')}
        activeOpacity={0.85}
      >
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>
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
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterHeader: {
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    fontSize: 14,
  },
  chipsContainer: {
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '400',
  },
  chipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  emptyContainer: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 80,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    width: 28,
  },
  cardMain: {
    flex: 1,
  },
  hangMuc: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: colors.primary + '28',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  ngay: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  chiPhi: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  noiLam: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    marginBottom: 12,
    alignItems: 'center' as const,
  },
  emptyText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptySubText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  fabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '400',
  },
});
