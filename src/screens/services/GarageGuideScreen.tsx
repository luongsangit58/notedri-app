import React from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppBgPattern from '../../components/AppBgPattern';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { servicesApi } from '../../api/services';
import { useColors } from '../../utils/theme';
import { formatVND } from '../../utils/format';
import { useT } from '../../i18n';

/* ─── FA6 → FA5 icon name map ─── */
const FA_MAP: Record<string, string> = {
  'fa-oil-can': 'oil-can',
  'fa-circle-dot': 'dot-circle',
  'fa-screwdriver-wrench': 'tools',
  'fa-clipboard-check': 'clipboard-check',
  'fa-toolbox': 'toolbox',
};
function fa5(name: string): string {
  return FA_MAP[name] ?? name.replace(/^fa-/, '');
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${mm}/${d.getFullYear()}`;
}

interface LastEntry { chi_phi: number; ngay: string }
interface Topic {
  loai: string;
  label: string;
  icon: string;
  questions: string[];
}

function TopicCard({ topic, last }: { topic: Topic; last?: LastEntry }) {
  const colors = useColors();
  const t = useT();
  return (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    }}>
      {/* Header row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: colors.primary + '22',
          alignItems: 'center', justifyContent: 'center', marginRight: 10,
        }}>
          <FontAwesome5 name={fa5(topic.icon)} size={16} color={colors.primary} solid />
        </View>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, flex: 1 }}>
          {topic.label}
        </Text>
        {last && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
              {'~' + formatVND(last.chi_phi)}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
              {t('services.garage_prev_service', { month: formatMonthYear(last.ngay) })}
            </Text>
          </View>
        )}
      </View>

      {/* Questions label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <FontAwesome5 name="comment-dots" size={11} color={colors.textSecondary} solid />
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
          {t('services.garage_ask_tech')}
        </Text>
      </View>

      {/* Questions list */}
      {topic.questions.map((q, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <FontAwesome5
            name="question-circle"
            size={13}
            color={colors.border}
            style={{ marginTop: 2 }}
          />
          <Text style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 20 }}>{q}</Text>
        </View>
      ))}
    </View>
  );
}

export default function GarageGuideScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['services', 'guide'],
    queryFn: () => servicesApi.guide().then(r => r.data?.data ?? r.data),
  });

  const topics: Topic[] = data?.topics ?? [];
  const lastByLoai: Record<string, LastEntry> = data?.last_by_loai ?? {};

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }} edges={['bottom']}>
        <AppBgPattern />
        <ActivityIndicator color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }} edges={['bottom']}>
        <AppBgPattern />
        <Text style={{ color: colors.error, fontWeight: '700', marginBottom: 12 }}>{t('common.error_load')}</Text>
        <TouchableOpacity onPress={() => refetch()}
          style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 }}>
          <Text style={{ color: colors.primaryText, fontWeight: '700' }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Subtitle */}
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 18 }}>
          {t('services.garage_desc')}
        </Text>

        {topics.map(topic => (
          <TopicCard
            key={topic.loai}
            topic={topic}
            last={lastByLoai[topic.loai]}
          />
        ))}

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 8 }}>
          {t('services.garage_footer')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
