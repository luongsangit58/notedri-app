import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { useColors } from '../../utils/theme';

const AMBER = '#F59E0B';

const FREE_FEATURES = [
  'Tối đa 2 xe',
  'Lịch sử 12 tháng gần nhất',
  'Báo cáo chi phí cơ bản',
  'Nhắc nhở bảo dưỡng',
  'Hồ sơ xe kỹ thuật số',
];

const PREMIUM_FEATURES = [
  { icon: 'crown',       text: 'Không giới hạn số xe' },
  { icon: 'history',     text: 'Lịch sử không giới hạn' },
  { icon: 'chart-line',  text: 'Báo cáo toàn bộ các năm' },
  { icon: 'search-location', text: 'Tìm cây xăng gần đây' },
  { icon: 'envelope',    text: 'Nhắc nhở qua email' },
  { icon: 'file-export', text: 'Xuất dữ liệu toàn bộ' },
];

function statusLabel(s?: string | null): string {
  if (s === 'pending')  return 'Đang chờ xét duyệt';
  if (s === 'approved') return 'Đã được duyệt';
  if (s === 'rejected') return 'Không được duyệt lần trước';
  return '';
}

export default function PremiumScreen() {
  const colors = useColors();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['premium-status'],
    queryFn: () => client.get('/premium').then(r => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 5,
  });

  const { mutate: requestTrial, isPending } = useMutation({
    mutationFn: () => client.post('/premium/trial', { context: 'mobile' }),
    onSuccess: (res: any) => {
      const msg = res?.data?.message ?? 'Đã gửi yêu cầu!';
      Alert.alert('Gửi thành công', msg);
      qc.invalidateQueries({ queryKey: ['premium-status'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Có lỗi xảy ra.';
      Alert.alert('Thông báo', msg);
    },
  });

  const isPremium: boolean = data?.is_premium ?? false;
  const onTrial: boolean = data?.on_trial ?? false;
  const canRequest: boolean = data?.can_request ?? false;
  const requestStatus: string | null = data?.request_status ?? null;
  const trialUsed: boolean = data?.trial_used ?? false;
  const trialDays: number = data?.trial_days ?? 14;
  const planExpiresAt: string | null = data?.plan_expires_at ?? null;

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} edges={['bottom']}>
        <ActivityIndicator color={AMBER} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={AMBER} />}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header */}
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <View style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: AMBER + '22', alignItems: 'center', justifyContent: 'center',
            marginBottom: 14, borderWidth: 2, borderColor: AMBER,
          }}>
            <FontAwesome5 name="crown" size={32} color={AMBER} solid />
          </View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 24, letterSpacing: -0.5 }}>
            NoteDri Premium
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            Không giới hạn xe. Không giới hạn lịch sử.
          </Text>
        </View>

        {/* Current plan status */}
        {isPremium ? (
          <View style={{
            backgroundColor: AMBER + '22', borderRadius: 14, padding: 16,
            borderWidth: 1.5, borderColor: AMBER, marginBottom: 24,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <FontAwesome5 name="check-circle" size={22} color={AMBER} solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: AMBER, fontWeight: '800', fontSize: 16 }}>
                {onTrial ? 'Đang dùng thử Premium' : 'Premium kích hoạt'}
              </Text>
              {planExpiresAt && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                  Hết hạn: {planExpiresAt}
                </Text>
              )}
            </View>
          </View>
        ) : requestStatus === 'pending' ? (
          <View style={{
            backgroundColor: '#0EA5E922', borderRadius: 14, padding: 16,
            borderWidth: 1, borderColor: '#0EA5E9', marginBottom: 24,
            flexDirection: 'row', alignItems: 'center', gap: 12,
          }}>
            <FontAwesome5 name="clock" size={20} color="#0EA5E9" solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0EA5E9', fontWeight: '700', fontSize: 15 }}>
                Yêu cầu đang chờ duyệt
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                Admin sẽ xét duyệt trong vòng 1–2 ngày làm việc.
              </Text>
            </View>
          </View>
        ) : null}

        {/* Premium features */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: AMBER, fontWeight: '800', fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Premium bao gồm
          </Text>
          {PREMIUM_FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <FontAwesome5 name={f.icon} size={14} color={AMBER} solid style={{ width: 18 }} />
              <Text style={{ color: colors.text, fontSize: 14 }}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Free plan */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 24 }}>
          <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Gói Miễn phí
          </Text>
          {FREE_FEATURES.map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FontAwesome5 name="check" size={12} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{f}</Text>
            </View>
          ))}
        </View>

        {/* CTA */}
        {!isPremium && canRequest && (
          <>
            <TouchableOpacity
              onPress={() => requestTrial()}
              disabled={isPending}
              style={{
                backgroundColor: AMBER, borderRadius: 14,
                paddingVertical: 16, alignItems: 'center', marginBottom: 12,
                opacity: isPending ? 0.7 : 1,
              }}>
              {isPending
                ? <ActivityIndicator color="#fff" />
                : (
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>
                    Dùng thử {trialDays} ngày miễn phí
                  </Text>
                )}
            </TouchableOpacity>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
              Gửi yêu cầu → admin xét duyệt → nhận email xác nhận
            </Text>
          </>
        )}

        {!isPremium && !canRequest && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {trialUsed
                ? 'Bạn đã từng dùng thử Premium. Mỗi tài khoản chỉ 1 lần.'
                : statusLabel(requestStatus)
              }
            </Text>
          </View>
        )}

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
          Giá chính thức sẽ được thông báo khi ra mắt.{'\n'}Người dùng sớm được ưu đãi đặc biệt.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
