import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { isNfcSupported, isNfcEnabled, writeVehicleTag, cancelNfcSession } from '../../services/nfc/NfcService';
import { contentWide } from '../../utils/layout';

type Status = 'idle' | 'writing' | 'success' | 'error' | 'unsupported' | 'disabled';

function GuideRow({ icon, text, colors }: { icon: string; text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
      <FontAwesome5 name={icon} size={12} color={colors.textSecondary} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary }}>{text}</Text>
    </View>
  );
}

export default function NfcSetupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const vehicleId: number = route.params?.vehicleId ?? 0;
  const vehicleName: string = route.params?.vehicleName ?? '';
  const bleDeviceId: string = route.params?.bleDeviceId ?? '';

  const t = useT();
  const colors = useColors();
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    isNfcSupported().then(async (supported) => {
      if (!supported) { setStatus('unsupported'); return; }
      const enabled = await isNfcEnabled();
      if (!enabled) setStatus('disabled');
    });
    // Rời màn hình giữa lúc đang chờ chạm thẻ (status 'writing') phải đóng session,
    // nếu không NFC reader kẹt ở trạng thái bận cho lần chạm kế tiếp ở màn khác.
    return () => { cancelNfcSession(); };
  }, []);

  async function handleWrite() {
    setStatus('writing');
    setErrorMessage(null);
    try {
      await writeVehicleTag({ vehicleId, bleDeviceId });
      setStatus('success');
    } catch (e: any) {
      setStatus('error');
      setErrorMessage(e?.message ?? String(e));
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('nfc.setup_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={[styles.body, contentWide]}>
        {/* Hướng dẫn gọn (góp ý user 16/7: chưa từng ghép thẻ thì không biết mua
            gì/dán đâu) - chỉ hiện khi CHƯA thành công, tránh thừa sau khi xong. */}
        {status === 'idle' && (
          <View style={[styles.guideCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <GuideRow icon="shopping-cart" text={t('nfc.guide_buy')} colors={colors} />
            <GuideRow icon="map-marker-alt" text={t('nfc.guide_place')} colors={colors} />
            <GuideRow icon="lightbulb" text={t('nfc.guide_tip')} colors={colors} />
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <FontAwesome5 name="wifi" size={40} color={status === 'success' ? colors.success : colors.primary} />

          {status === 'unsupported' && (
            <Text style={[styles.text, { color: colors.textSecondary }]}>{t('nfc.unsupported')}</Text>
          )}
          {status === 'disabled' && (
            <Text style={[styles.text, { color: colors.textSecondary }]}>{t('nfc.disabled')}</Text>
          )}
          {status === 'idle' && (
            <Text style={[styles.text, { color: colors.textSecondary }]}>
              {t('nfc.setup_instruction', { vehicleName })}
            </Text>
          )}
          {status === 'writing' && (
            <>
              <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
              <Text style={[styles.text, { color: colors.textSecondary }]}>{t('nfc.writing')}</Text>
            </>
          )}
          {status === 'success' && (
            <Text style={[styles.text, { color: colors.success }]}>{t('nfc.write_success')}</Text>
          )}
          {status === 'error' && (
            <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage ?? t('nfc.write_error')}</Text>
          )}
        </View>

        {status !== 'unsupported' && status !== 'disabled' && status !== 'writing' && (
          <TouchableOpacity
            onPress={handleWrite}
            style={[styles.button, { backgroundColor: colors.primary }]}>
            <Text style={styles.buttonText}>
              {status === 'success' ? t('nfc.write_again') : t('nfc.start_write')}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  guideCard: {
    borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1,
  },
  card: {
    borderRadius: 16, padding: 24, alignItems: 'center', gap: 8,
  },
  text: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  errorText: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  button: {
    marginTop: 20, borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
