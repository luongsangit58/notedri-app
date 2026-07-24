import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import Constants from 'expo-constants';
import AppBgPattern from '../../components/AppBgPattern';

const version = Constants.expoConfig?.version ?? '1.0.0';

function LinkRow({ icon, label, url }: { icon: string; label: string; url: string }) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={() => Linking.openURL(url)}
      style={{
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
      <FontAwesome5 name={icon} size={15} color={colors.textSecondary} solid style={{ width: 24, marginRight: 14 }} />
      <Text style={{ flex: 1, color: colors.text, fontSize: 15 }}>{label}</Text>
      <FontAwesome5 name="external-link-alt" size={12} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export default function AboutScreen() {
  const colors = useColors();
  const t = useT();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <ScrollView contentContainerStyle={{ paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }}>

        {/* Logo / Brand */}
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <Image
            source={require('../../../assets/icon-3d.png')}
            style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 14 }}
          />
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 26, letterSpacing: -0.5 }}>
            Note<Text style={{ color: colors.primary }}>Dri</Text>
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
            {t('about.version', { version })}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            {t('about.tagline')}
          </Text>
        </View>

        {/* Sứ mệnh (khớp web) */}
        <View style={{ marginHorizontal: 16, marginBottom: 18 }}>
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700', textAlign: 'center', fontStyle: 'italic', marginBottom: 8 }}>
            "{t('about.slogan')}"
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 21, textAlign: 'center' }}>
            {t('about.mission')}
          </Text>
        </View>

        {/* Links */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, overflow: 'hidden', marginBottom: 16 }}>
          <LinkRow icon="globe" label={t('about.website')} url="https://notedri.com" />
          <LinkRow icon="shield-alt" label={t('about.privacy_policy')} url="https://notedri.com/privacy" />
          <LinkRow icon="file-contract" label={t('about.terms')} url="https://notedri.com/terms" />
        </View>

        {/* Features summary */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, marginHorizontal: 16, padding: 16, marginBottom: 16 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 12 }}>
            {t('about.features_title')}
          </Text>
          {[
            { icon: 'camera',           text: t('about.feature_ocr') },
            { icon: 'route',            text: t('about.feature_gps') },
            { icon: 'heartbeat',        text: t('about.feature_obd') },
            { icon: 'gas-pump',         text: t('about.feature_refuel') },
            { icon: 'tools',            text: t('about.feature_service') },
            { icon: 'charging-station', text: t('about.feature_stations') },
            { icon: 'chart-bar',        text: t('about.feature_reports') },
          ].map((f, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <FontAwesome5 name={f.icon} size={13} color={colors.primary} solid style={{ width: 18 }} />
              <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{f.text}</Text>
            </View>
          ))}
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginHorizontal: 24 }}>
          {t('about.developer_data_note')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
