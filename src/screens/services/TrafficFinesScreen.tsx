import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { trafficFinesApi, TrafficFineRow } from '../../api/trafficFines';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { INPUT_FONT_FAMILY } from '../../utils/font';
import { useT } from '../../i18n';
import { formatVND } from '../../utils/format';
import { normalizeSearch } from '../../utils/text';
import { contentWide } from '../../utils/layout';

const LOAI_XE_OPTIONS = ['oto', 'xe_may'] as const;
const NHOM_OPTIONS = [
  'toc_do', 'nong_do_con', 'den_bien_bao', 'lan_duong', 'dung_do', 're_nhuong_duong', 'khac',
] as const;

export default function TrafficFinesScreen() {
  const navigation = useNavigation<any>();
  const t = useT();
  const colors = useColors();

  const [loaiXe, setLoaiXe] = useState<string | null>(null);
  const [nhom, setNhom] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['traffic-fines'],
    queryFn: () => trafficFinesApi.list().then((r) => r.data?.data ?? []),
    staleTime: 1000 * 60 * 60, // dữ liệu tĩnh (Nghị định) - đổi rất hiếm
  });

  const rows: TrafficFineRow[] = data ?? [];
  const normalizedKeyword = normalizeSearch(keyword);
  const filtered = useMemo(() => rows.filter((r) => {
    if (loaiXe && r.loai_xe !== loaiXe) return false;
    if (nhom && r.nhom !== nhom) return false;
    if (normalizedKeyword && !normalizeSearch(r.hanh_vi).includes(normalizedKeyword)) return false;
    return true;
  }), [rows, loaiXe, nhom, normalizedKeyword]);

  const styles = StyleSheet.create({
    chip: {
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
      borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginRight: 8,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
    chipTextActive: { color: colors.primaryText, fontWeight: '700' },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'left', 'right']}>
      <AppBgPattern />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{t('traffic_fines.title')}</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: 32 }, contentWide]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
              {t('traffic_fines.hint')}
            </Text>

            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder={t('traffic_fines.search_placeholder')}
              placeholderTextColor={colors.textSecondary}
              style={{
                backgroundColor: colors.card, color: colors.text, borderRadius: 10, borderWidth: 1,
                borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 12,
                fontFamily: INPUT_FONT_FAMILY,
              }}
            />

            {/* ScrollView (không phải FlatList) - cùng quy ước hàng chip lọc nhỏ đã dùng ở
                ServicesScreen.tsx (vehicle filter), tránh lồng VirtualizedList bên trong
                ListHeaderComponent của FlatList ngoài. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {[null, ...LOAI_XE_OPTIONS].map((item) => {
                const active = loaiXe === item;
                return (
                  <TouchableOpacity
                    key={item ?? 'all'}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setLoaiXe(item)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item === null ? t('common.all') : t(`traffic_fines.loai_${item}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {[null, ...NHOM_OPTIONS].map((item) => {
                const active = nhom === item;
                return (
                  <TouchableOpacity
                    key={item ?? 'all'}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setNhom(item)}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {item === null ? t('common.all') : t(`traffic_fines.nhom_${item}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {isLoading && (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            )}
            {isError && (
              <TouchableOpacity
                onPress={() => refetch()}
                style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Text style={{ color: colors.error, fontSize: 13, marginBottom: 8 }}>{t('common.error_load')}</Text>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>{t('common.retry')}</Text>
              </TouchableOpacity>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 24 }}>
                {t('traffic_fines.no_results')}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{
            backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
            padding: 14, marginBottom: 10,
          }}>
            <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{item.hanh_vi}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <FontAwesome5 name="money-bill-wave" size={12} color={colors.error} solid />
              <Text style={{ color: colors.error, fontWeight: '800', fontSize: 14 }}>
                {formatVND(item.muc_phat_tu)} - {formatVND(item.muc_phat_den)}
              </Text>
            </View>
            {item.diem_tru_gplx != null && item.diem_tru_gplx > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <FontAwesome5 name="id-card" size={12} color={colors.warning} solid />
                <Text style={{ color: colors.warning, fontSize: 12.5, fontWeight: '600' }}>
                  {t('traffic_fines.points_deducted', { n: item.diem_tru_gplx })}
                </Text>
              </View>
            )}
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
              {item.can_cu_phap_ly}
            </Text>
          </View>
        )}
        ListFooterComponent={
          filtered.length > 0 ? (
            <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 8, fontStyle: 'italic' }}>
              {t('traffic_fines.disclaimer')}
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
