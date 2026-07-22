import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { vehiclesApi } from '../../api/vehicles';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import NoriAvatar from './NoriAvatar';
import { noriMoodFromScore, NoriMood } from '../../services/nori/nori';

interface NoriDailyCardProps {
  vehicleId: number;
  vehicleName: string;
  obdConnected: boolean;
}

// Card "Nori báo cáo hôm nay" ở đầu HomeScreen: tóm tắt 1 câu tình trạng xe dựa
// trên điểm sức khỏe (cùng nguồn dữ liệu + queryKey với HealthScreen nên không
// tốn thêm round-trip nếu user đã từng mở màn Sức khỏe). Bấm vào mở chi tiết.
export default function NoriDailyCard({ vehicleId, vehicleName, obdConnected }: NoriDailyCardProps) {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();

  const { data: healthRaw, isLoading } = useQuery({
    queryKey: ['vehicles', vehicleId, 'health'],
    queryFn: () => vehiclesApi.health(vehicleId).then((r) => r.data),
    enabled: !!vehicleId,
    retry: 1,
  });
  const health: any = healthRaw?.data ?? healthRaw ?? null;
  const total: number | null = health?.score?.total ?? (health?.health_score != null ? Number(health.health_score) : null);
  const organs: any[] = Array.isArray(health?.organs) ? health.organs : [];
  const hasUrgentOrgan = organs.some((o) => o.status === 'urgent');
  const hasWarnOrgan = organs.some((o) => o.status === 'warn');
  const topIssue = organs.find((o) => o.status === 'urgent') ?? organs.find((o) => o.status === 'warn');

  const mood: NoriMood = isLoading ? 'unknown' : noriMoodFromScore(total, hasUrgentOrgan, hasWarnOrgan);
  const verdictKey = `nori.${mood}` as const;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => navigation.navigate('Health', { vehicleId })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
      <NoriAvatar mood={mood} size={44} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>{t('nori.card_title')}</Text>
          {isLoading && <ActivityIndicator size="small" color={colors.textSecondary} />}
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
          {topIssue?.label ? t('nori.warn_detail', { issue: topIssue.label }) : t(verdictKey as any)}
        </Text>
        {obdConnected && (
          <Text style={{ color: colors.primary, fontSize: 11, marginTop: 3, fontWeight: '600' }}>
            {t('nori.obd_live_note')}
          </Text>
        )}
      </View>
      <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}
