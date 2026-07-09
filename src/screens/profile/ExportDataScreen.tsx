import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <FontAwesome5 name={icon as any} size={14} color={colors.textSecondary} solid style={{ width: 22 }} />
      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14, marginLeft: 10 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{value}</Text>
    </View>
  );
}

export default function ExportDataScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await client.get('/account/export');
      const exportData = res.data?.data ?? res.data;
      setPreview(exportData);
    } catch (err: any) {
      if (err?.response?.status === 403) {
        Alert.alert(
          t('export.premium_feature_title'),
          err?.response?.data?.message || t('export.premium_required'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('export.upgrade_button'), onPress: () => navigation.navigate('Premium') },
          ],
        );
      } else {
        Alert.alert(t('common.error'), t('export.error_msg'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!preview) return;
    const json = JSON.stringify(preview, null, 2);
    await Share.share({
      message: json,
      title: t('export.title'),
    });
  };

  const vehicleCount = preview?.vehicles?.length ?? 0;
  const refuelCount = preview?.refuels?.length ?? 0;
  const serviceCount = preview?.vehicles?.reduce(
    (acc: number, v: any) => acc + (v.service_logs?.length ?? 0), 0
  ) ?? 0;
  const odoCount = preview?.vehicles?.reduce(
    (acc: number, v: any) => acc + (v.odometer_readings?.length ?? 0), 0
  ) ?? 0;
  const reminderCount = preview?.vehicles?.reduce(
    (acc: number, v: any) => acc + (v.reminders?.length ?? 0), 0
  ) ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header card */}
        <View style={{
          backgroundColor: colors.surface, borderRadius: 14, padding: 20, marginBottom: 20, alignItems: 'center',
        }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <FontAwesome5 name="download" size={26} color={colors.primary} solid />
          </View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>
            {t('export.title')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
            {t('export.full_subtitle')}
          </Text>
        </View>

        {/* What's included */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16, marginBottom: 20 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 14, paddingBottom: 4 }}>
            {t('export.included_label')}
          </Text>
          <InfoRow icon="car-side"   label={t('export.vehicles')}  value={preview ? vehicleCount : '—'} />
          <InfoRow icon="gas-pump"   label={t('export.refuels')}   value={preview ? refuelCount : '—'} />
          <InfoRow icon="wrench"     label={t('export.services')}  value={preview ? serviceCount : '—'} />
          <InfoRow icon="road"       label={t('export.odo')}       value={preview ? odoCount : '—'} />
          <InfoRow icon="bell"       label={t('export.reminders')} value={preview ? reminderCount : '—'} />
          {preview?.exported_at && (
            <View style={{ paddingVertical: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {t('export.exported_at_label', { time: new Date(preview.exported_at).toLocaleString('vi-VN') })}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {!preview ? (
          <TouchableOpacity
            onPress={handleExport}
            disabled={loading}
            style={{
              backgroundColor: colors.primary, borderRadius: 12,
              paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
              opacity: loading ? 0.6 : 1,
            }}>
            {loading
              ? <ActivityIndicator color={colors.primaryText} />
              : <>
                  <FontAwesome5 name="download" size={16} color={colors.primaryText} solid />
                  <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>{t('export.download_button')}</Text>
                </>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={handleShare}
              style={{
                backgroundColor: colors.primary, borderRadius: 12,
                paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
              }}>
              <FontAwesome5 name="share-alt" size={16} color={colors.primaryText} solid />
              <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>{t('export.share_button')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setPreview(null); }}
              style={{
                backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                paddingVertical: 14, alignItems: 'center',
              }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{t('export.reload_button')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 }}>
          {t('export.privacy_note')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
