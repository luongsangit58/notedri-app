import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { obdApi, DtcLookupResult } from '../../api/obd';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { formatVNDShort } from '../../utils/format';
import { useT } from '../../i18n';

// Màu theo mức nghiêm trọng - khớp bảng màu severity đang dùng ở web (critical/warn/info)
const SEVERITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  warn: '#F59E0B',
  info: '#3B82F6',
};

const CAN_DRIVE_COLOR: Record<string, string> = {
  yes: '#22C55E',
  caution: '#F59E0B',
  stop: '#EF4444',
};

const CAN_DRIVE_ICON: Record<string, string> = {
  yes: 'check-circle',
  caution: 'exclamation-triangle',
  stop: 'hand-paper',
};

// Mã SAE J2012: 1 chữ hệ thống + 4 ký tự hex (P0420, C0035, U0100, B1318)
const DTC_FORMAT = /^[PCBU][0-9A-F]{4}$/;

export default function DtcLookupScreen() {
  const navigation = useNavigation<any>();
  const t = useT();
  const colors = useColors();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DtcLookupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const normalized = input.trim().toUpperCase();
  const isValidFormat = DTC_FORMAT.test(normalized);

  async function handleSearch() {
    if (!isValidFormat || loading) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await obdApi.lookupDtc(normalized);
      setResult(res.data.data);
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message ?? t('dtc.lookup_error'));
    } finally {
      setLoading(false);
    }
  }

  const severity = result?.severity ?? null;
  const canDrive = result?.can_drive ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{t('dtc.lookup_title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('dtc.lookup_hint')}</Text>

        {/* Search row */}
        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
            ]}
            value={input}
            onChangeText={(v) => {
              setInput(v.toUpperCase());
              setResult(null);
              setErrorMsg(null);
            }}
            placeholder={t('dtc.input_placeholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={5}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: isValidFormat ? '#3B82F6' : colors.border }]}
            onPress={handleSearch}
            disabled={!isValidFormat || loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <FontAwesome5 name="search" size={15} color="#fff" />}
          </TouchableOpacity>
        </View>

        {normalized.length >= 5 && !isValidFormat && (
          <Text style={styles.errorText}>{t('dtc.invalid_format')}</Text>
        )}
        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        {/* Result: known code */}
        {result?.known && (
          <View style={[styles.resultCard, { backgroundColor: colors.card }]}>
            <View style={styles.resultHeader}>
              <Text style={[styles.resultCode, { color: colors.text }]}>{result.code}</Text>
              {severity && (
                <View style={[styles.badge, { backgroundColor: SEVERITY_COLOR[severity] + '22' }]}>
                  <Text style={[styles.badgeText, { color: SEVERITY_COLOR[severity] }]}>
                    {t(`dtc.severity_${severity}`)}
                  </Text>
                </View>
              )}
            </View>

            <Text style={[styles.resultTitle, { color: colors.text }]}>{result.title_vi}</Text>
            {result.title_en ? (
              <Text style={[styles.resultTitleEn, { color: colors.textSecondary }]}>{result.title_en}</Text>
            ) : null}

            {/* Đi tiếp được không - câu trả lời quan trọng nhất, nổi bật nhất */}
            {canDrive && (
              <View style={[styles.canDriveRow, { backgroundColor: CAN_DRIVE_COLOR[canDrive] + '18' }]}>
                <FontAwesome5
                  name={CAN_DRIVE_ICON[canDrive]}
                  size={16}
                  color={CAN_DRIVE_COLOR[canDrive]}
                  solid
                />
                <Text style={[styles.canDriveText, { color: CAN_DRIVE_COLOR[canDrive] }]}>
                  {t(`dtc.can_drive_${canDrive}`)}
                </Text>
              </View>
            )}

            {result.action_vi ? (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('dtc.action_title')}</Text>
                <Text style={[styles.sectionText, { color: colors.text }]}>{result.action_vi}</Text>
              </View>
            ) : null}

            {result.cost_min != null && result.cost_max != null && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('dtc.cost_estimate')}</Text>
                <Text style={[styles.sectionText, { color: colors.text }]}>
                  {formatVNDShort(result.cost_min)} - {formatVNDShort(result.cost_max)}
                </Text>
              </View>
            )}

            <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('dtc.disclaimer')}</Text>
          </View>
        )}

        {/* Result: valid format but not in dictionary */}
        {result && !result.known && (
          <View style={[styles.resultCard, { backgroundColor: colors.card, alignItems: 'center', gap: 8 }]}>
            <FontAwesome5 name="question-circle" size={24} color={colors.textSecondary} />
            <Text style={[styles.sectionText, { color: colors.text, textAlign: 'center' }]}>
              {t('dtc.unknown_code', { code: result.code })}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
  },
  searchBtn: {
    width: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { color: '#EF4444', fontSize: 13, marginTop: 8 },
  resultCard: { borderRadius: 12, padding: 16, marginTop: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultCode: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  resultTitle: { fontSize: 15, fontWeight: '600', marginTop: 10, lineHeight: 21 },
  resultTitleEn: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  canDriveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  canDriveText: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  section: { marginTop: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 3 },
  sectionText: { fontSize: 14, lineHeight: 20 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 14, fontStyle: 'italic' },
});
