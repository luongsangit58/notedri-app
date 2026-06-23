import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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

function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
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
        <Text style={styles.icon}>🔧</Text>
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
        <Text style={styles.noiLam} numberOfLines={1}>📍 {item.noi_lam}</Text>
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

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await refetch();
    setRefreshing(false);
  };

  if (isLoading && items.length === 0) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔧</Text>
            <Text style={styles.emptyText}>Chưa có lịch sử bảo dưỡng</Text>
            <Text style={styles.emptySubText}>Nhấn + để thêm lần bảo dưỡng đầu tiên</Text>
          </View>
        }
        renderItem={({ item }) => <ServiceCard item={item} onPress={() => navigation.navigate('EditService', { serviceId: item.id })} />}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddService')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
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
    fontSize: 22,
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
    fontSize: 48,
    marginBottom: 12,
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
