import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { obdApi, DtcLookupResult } from '../../api/obd';
import { lookupDtcOffline, suggestDtcOffline, withDefaultDtcPrefix } from '../../services/obd/dtcOfflineDictionary';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors, useThemeStore } from '../../utils/theme';
import { formatVND } from '../../utils/format';
import { BASE_URL } from '../../utils/api';
import { useT } from '../../i18n';

// Nối DTC → blog (checklist "E - nối mã DTC → bài blog"): chỉ 1 bài blog VN
// hiện thực sự khớp mọi mã DTC (giải thích đèn Check Engine + mã P0xxx +
// mức khẩn cấp) - dùng làm liên kết chung thay vì gán bừa cho từng mã khi
// chưa có bài viết riêng theo từng nhóm lỗi.
const GENERAL_DTC_BLOG_SLUG = 'cach-doc-den-bao-loi-dong-co';

// Màu theo mức nghiêm trọng - khớp bảng màu severity đang dùng ở web (critical/warn/info)
const SEVERITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  warn: '#F59E0B',
  info: '#3B82F6',
};

// Rà soát 18/7 (user: chỉ có viền màu chưa đủ rõ) - icon riêng theo mức độ, đi kèm chú giải
// để user không phải đoán ý nghĩa màu. Rà soát 18/7 (lần 2 - user: Cảnh báo nên là hình
// vuông thay vì tròn cho dễ phân biệt hình dạng với 2 mức còn lại) - FontAwesome5 Free (bộ
// icon đóng gói offline trong @expo/vector-icons, xem glyphmaps/FontAwesome5Free.json)
// KHÔNG có icon "exclamation-square"/"square-exclamation" nào cả, nên warn tự vẽ khối
// vuông nhỏ + dấu "!" (SeverityMark bên dưới) thay vì dùng icon font.
const SEVERITY_ICON: Record<string, string> = {
  critical: 'exclamation-triangle',
  info: 'info-circle',
};

function SeverityMark({ severity, size = 13 }: { severity: string; size?: number }) {
  const color = SEVERITY_COLOR[severity];
  const isDark = useThemeStore((s) => s.mode === 'dark');
  if (severity === 'warn') {
    // Rà soát 18/7 (lần 3 - user: icon tam giác/tròn có dấu !/i dạng khoảng trống trong
    // suốt nên TỰ ĐỘNG lộ màu nền thẻ phía sau (thẻ sáng -> trông trắng, thẻ tối -> trông
    // đen) - khối vuông tự vẽ không có hiệu ứng trong suốt đó nên phải chọn màu tay theo
    // đúng theme hiện tại để mô phỏng lại: sáng -> trắng, tối -> đen.
    return (
      <View style={{
        width: size, height: size, borderRadius: 2, backgroundColor: color,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: isDark ? '#000' : '#fff', fontSize: size * 0.7, fontWeight: '900', lineHeight: size * 0.85 }}>!</Text>
      </View>
    );
  }
  return <FontAwesome5 name={SEVERITY_ICON[severity]} size={size} color={color} solid />;
}

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

// Rà soát 17/7 (user báo màn tra lỗi chỉ có ô search trống, không gợi ý gì) -
// mã lỗi động cơ hay gặp nhất trên xe phổ thông VN, tra offline luôn từ dictionary
// đóng gói sẵn (dtcDictionary.json) nên không cần mạng để hiện.
// Rà soát 18/7 (user: 10 mã dài quá) -> đúng 2 mã/mức độ (critical/warn/info), đồng
// bộ với web (DtcLookupController::COMMON_CODES).
const COMMON_DTC_CODES = [
  'P0300', 'P0301', // critical
  'P0171', 'P0420', // warn
  'P0442', 'P0455', // info
];

export default function DtcLookupScreen() {
  const navigation = useNavigation<any>();
  const t = useT();
  const colors = useColors();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DtcLookupResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const normalized = withDefaultDtcPrefix(input);
  const isValidFormat = DTC_FORMAT.test(normalized);

  const commonResults = useMemo(
    () => COMMON_DTC_CODES.map((code) => lookupDtcOffline(code)),
    [],
  );

  // Gợi ý gõ-tới-đâu (vd "P03" -> P0300, P0301...) - lọc offline trong RAM (xem
  // dtcOfflineDictionary.suggestDtcOffline), ẩn ngay khi đã có kết quả tra cứu.
  const suggestions = useMemo(
    () => (!result && !errorMsg ? suggestDtcOffline(normalized) : []),
    [normalized, result, errorMsg],
  );

  async function searchCode(code: string) {
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setIsOffline(false);
    try {
      const res = await obdApi.lookupDtc(code);
      setResult(res.data.data);
    } catch (e: any) {
      // 422 = mã sai định dạng theo server - hiện thông báo. Mọi lỗi khác (mất mạng,
      // server down) rơi về snapshot offline đóng gói trong app: trong hầm gửi xe
      // không có sóng chính là lúc cần tra mã nhất.
      if (e?.response?.status === 422) {
        setErrorMsg(e.response.data?.message ?? t('dtc.invalid_format'));
      } else {
        setResult(lookupDtcOffline(code));
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (!isValidFormat || loading) return;
    searchCode(normalized);
  }

  function handlePickCommon(code: string) {
    setInput(code);
    searchCode(code);
  }

  // Bug 17/7 (user báo): bấm mã lỗi hay gặp ra kết quả, rồi bấm mũi tên quay lại
  // thì thoát thẳng về Home thay vì quay lại danh sách - vì kết quả tra cứu chỉ là
  // state nội bộ của cùng 1 màn hình (không push thêm màn mới). Nút back phải "lùi"
  // qua state đó trước, chỉ thoát màn hình khi đã ở trạng thái ban đầu.
  function handleBack() {
    if (result || errorMsg || input.length > 0) {
      setInput('');
      setResult(null);
      setErrorMsg(null);
      setIsOffline(false);
      return;
    }
    navigation.goBack();
  }

  const severity = result?.severity ?? null;
  const canDrive = result?.can_drive ?? null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <AppBgPattern />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
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

        {/* Gợi ý gõ-tới-đâu - chỉ hiện khi đang gõ dở, chưa có kết quả.
            Rà soát 18/7 (user: "..." cắt 1 dòng khó hiểu, badge chữ lặp lại mọi dòng dài
            dòng) - mô tả cho xuống tối đa 2 dòng thay vì cắt cụt 1 dòng, và thay badge chữ
            lặp lại bằng viền màu trái + icon theo mức độ (đủ nhận biết nhanh, đỡ rối mắt
            khi liệt kê nhiều dòng liên tiếp). */}
        {suggestions.length > 0 && (
          <View style={[styles.suggestBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {suggestions.map((s, idx) => (
              <TouchableOpacity
                key={s.code}
                style={[
                  styles.suggestRow,
                  { borderLeftWidth: 4, borderLeftColor: SEVERITY_COLOR[s.severity] },
                  idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                ]}
                onPress={() => handlePickCommon(s.code)}>
                <SeverityMark severity={s.severity} />
                <Text style={[styles.commonCode, { color: colors.text }]}>{s.code}</Text>
                <Text style={[styles.commonLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                  {s.title_vi}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
                  {formatVND(result.cost_min)} - {formatVND(result.cost_max)}
                </Text>
              </View>
            )}

            {!isOffline && (
              <TouchableOpacity
                style={styles.blogLink}
                onPress={() => Linking.openURL(`${BASE_URL}/blog/${GENERAL_DTC_BLOG_SLUG}`)}>
                <FontAwesome5 name="book-open" size={12} color={colors.primary} />
                <Text style={[styles.blogLinkText, { color: colors.primary }]}>{t('dtc.related_blog')}</Text>
              </TouchableOpacity>
            )}

            <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>{t('dtc.disclaimer')}</Text>
            {isOffline && (
              <Text style={[styles.disclaimer, { color: colors.textSecondary, marginTop: 4 }]}>
                {t('dtc.offline_note')}
              </Text>
            )}
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

        {/* Danh sách mã lỗi thường gặp - chỉ hiện khi chưa gõ/chưa có kết quả tra cứu,
            tránh màn hình chỉ có mỗi ô search trống không biết bắt đầu từ đâu. */}
        {!result && !errorMsg && input.length === 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.commonTitle, { color: colors.text }]}>{t('dtc.common_codes_title')}</Text>
            {/* Chú giải icon + màu mức độ - rà soát 18/7 (user: chỉ viền màu chưa đủ rõ,
                nên có icon và giải thích để không phải đoán ý nghĩa màu). */}
            <View style={styles.legendRow}>
              {(['critical', 'warn', 'info'] as const).map((sev) => (
                <View key={sev} style={styles.legendItem}>
                  <SeverityMark severity={sev} size={11} />
                  <Text style={[styles.legendText, { color: colors.textSecondary }]}>
                    {t(`dtc.severity_${sev}`)}
                  </Text>
                </View>
              ))}
            </View>
            {commonResults.map((r) => (
              <TouchableOpacity
                key={r.code}
                style={[
                  styles.commonRow,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  r.severity && { borderLeftWidth: 4, borderLeftColor: SEVERITY_COLOR[r.severity] },
                ]}
                onPress={() => handlePickCommon(r.code)}>
                {r.severity && <SeverityMark severity={r.severity} />}
                <Text style={[styles.commonCode, { color: colors.text }]}>{r.code}</Text>
                <Text style={[styles.commonLabel, { color: colors.textSecondary }]} numberOfLines={2}>
                  {r.title_vi}
                </Text>
              </TouchableOpacity>
            ))}
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
  suggestBox: { borderRadius: 10, borderWidth: 1, marginTop: 8, overflow: 'hidden' },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
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
  blogLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  blogLinkText: { fontSize: 12, fontWeight: '600' },
  commonTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontSize: 11 },
  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  commonCode: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5, width: 62 },
  commonLabel: { flex: 1, fontSize: 12 },
});
