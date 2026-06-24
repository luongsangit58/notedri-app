import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

const AMBER = '#F59E0B';

export default function PremiumScreen() {
  const colors = useColors();
  const t = useT();
  const qc = useQueryClient();

  const FREE_FEATURES = [
    t('premium.free_feature_2_vehicles'),
    t('premium.free_feature_12months'),
    t('premium.free_feature_basic_reports'),
    t('premium.free_feature_reminders'),
    t('premium.free_feature_dossier'),
  ];

  const PREMIUM_FEATURES = [
    { icon: 'crown',            text: t('premium.feature_unlimited_vehicles') },
    { icon: 'history',          text: t('premium.feature_unlimited_history') },
    { icon: 'chart-line',       text: t('premium.feature_all_year_reports') },
    { icon: 'search-location',  text: t('premium.feature_nearby_stations') },
    { icon: 'envelope',         text: t('premium.feature_email_reminders') },
    { icon: 'file-export',      text: t('premium.feature_export') },
  ];

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['premium-status'],
    queryFn: () => client.get('/premium').then(r => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 5,
  });

  const { mutate: requestTrial, isPending } = useMutation({
    mutationFn: () => client.post('/premium/trial', { context: 'mobile' }),
    onSuccess: (res: any) => {
      const msg = res?.data?.message ?? t('common.send');
      Alert.alert(t('premium.notification_title'), msg);
      qc.invalidateQueries({ queryKey: ['premium-status'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? t('common.error_generic');
      Alert.alert(t('premium.notification_title'), msg);
    },
  });

  const isPremium: boolean = data?.is_premium ?? false;
  const onTrial: boolean = data?.on_trial ?? false;
  const canRequest: boolean = data?.can_request ?? false;
  const requestStatus: string | null = data?.request_status ?? null;
  const trialUsed: boolean = data?.trial_used ?? false;
  const trialDays: number = data?.trial_days ?? 14;
  const planExpiresAt: string | null = data?.plan_expires_at ?? null;

  function statusLabel(s?: string | null): string {
    if (s === 'pending')  return t('premium.request_pending_label');
    if (s === 'approved') return t('premium.request_approved_label');
    if (s === 'rejected') return t('premium.request_rejected_label');
    return '';
  }

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
            {t('premium.title')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center' }}>
            {t('premium.tagline')}
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
                {onTrial ? t('premium.trial_active_label') : t('premium.active_label')}
              </Text>
              {planExpiresAt && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {t('premium.expires_label')}: {planExpiresAt}
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
                {t('premium.pending_title')}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                {t('premium.pending_desc')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Premium features */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: AMBER, fontWeight: '800', fontSize: 14, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {t('premium.includes_title')}
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
            {t('premium.free_title')}
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
                    {t('premium.trial_cta').replace('{days}', String(trialDays))}
                  </Text>
                )}
            </TouchableOpacity>
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginBottom: 16 }}>
              {t('premium.request_flow_desc')}
            </Text>
          </>
        )}

        {!isPremium && !canRequest && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {trialUsed
                ? t('premium.trial_used_msg')
                : statusLabel(requestStatus)
              }
            </Text>
          </View>
        )}

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
          {t('premium.pricing_note')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
