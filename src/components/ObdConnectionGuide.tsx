import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ImageSourcePropType } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

/**
 * Hướng dẫn kết nối OBD2 - bản chỉn chu thay cho card 3 dòng chữ cũ (Sang phản
 * hồi 14/7: quá sơ sài). Mỗi bước có số thứ tự, icon, tiêu đề + mô tả và MỘT Ô
 * HÌNH MINH HOẠ.
 *
 * THÊM HÌNH: khi có hình từ ChatGPT (xem prompt trong
 * _bmad-output/CHATGPT-PROMPT-OBD-GUIDE-IMAGES-*.md), lưu vào
 * assets/obd-guide/ rồi bỏ comment require tương ứng dưới đây theo đúng khoá
 * bước. Chưa có hình thì ô hiển thị placeholder, KHÔNG vỡ layout hay crash
 * (require tĩnh của RN sẽ ném lỗi nếu file thiếu nên phải để trong map này).
 */
const GUIDE_IMAGES: Partial<Record<StepKey, ImageSourcePropType>> = {
  // find_port: require('../../assets/obd-guide/step-find-port.png'),
  // plug_adapter: require('../../assets/obd-guide/step-plug-adapter.png'),
  // start_engine: require('../../assets/obd-guide/step-start-engine.png'),
  // scan_connect: require('../../assets/obd-guide/step-scan-connect.png'),
};

type StepKey = 'find_port' | 'plug_adapter' | 'start_engine' | 'scan_connect';

const STEPS: { key: StepKey; icon: string }[] = [
  { key: 'find_port', icon: 'search-location' },
  { key: 'plug_adapter', icon: 'plug' },
  { key: 'start_engine', icon: 'key' },
  { key: 'scan_connect', icon: 'bluetooth-b' },
];

function StepIllustration({ stepKey }: { stepKey: StepKey }) {
  const colors = useColors();
  const t = useT();
  const source = GUIDE_IMAGES[stepKey];

  if (source) {
    return (
      <Image
        source={source}
        style={[styles.illustration, { backgroundColor: colors.background }]}
        resizeMode="cover"
      />
    );
  }

  // Placeholder tới khi có hình thật - vẫn giữ đúng khung tỉ lệ để layout không nhảy
  return (
    <View style={[styles.illustration, styles.illustrationPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <FontAwesome5 name="image" size={20} color={colors.textSecondary} />
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
        {t('obd.guide_img_pending')}
      </Text>
    </View>
  );
}

export default function ObdConnectionGuide() {
  const colors = useColors();
  const t = useT();
  const [showTrouble, setShowTrouble] = useState(false);

  return (
    <View style={{ marginTop: 24 }}>
      {/* Tiêu đề */}
      <Text style={[styles.title, { color: colors.text }]}>{t('obd.guide_title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('obd.guide_subtitle')}</Text>

      {/* Cần chuẩn bị */}
      <View style={[styles.needCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.needTitle, { color: colors.text }]}>{t('obd.guide_need_title')}</Text>
        <View style={styles.needRow}>
          {[
            { icon: 'microchip', label: t('obd.guide_need_adapter') },
            { icon: 'car', label: t('obd.guide_need_engine') },
            { icon: 'mobile-alt', label: t('obd.guide_need_bt') },
          ].map((n) => (
            <View key={n.icon} style={styles.needItem}>
              <View style={[styles.needIcon, { backgroundColor: colors.primary + '18' }]}>
                <FontAwesome5 name={n.icon} size={15} color={colors.primary} solid />
              </View>
              <Text style={[styles.needLabel, { color: colors.textSecondary }]}>{n.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Các bước */}
      {STEPS.map((step, i) => (
        <View key={step.key} style={[styles.stepCard, { backgroundColor: colors.card }]}>
          <StepIllustration stepKey={step.key} />
          <View style={styles.stepBody}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <FontAwesome5 name={step.icon} size={14} color={colors.primary} />
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                {t(`obd.guide_s${i + 1}_title` as any)}
              </Text>
            </View>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
              {t(`obd.guide_s${i + 1}_desc` as any)}
            </Text>
          </View>
        </View>
      ))}

      {/* Thiết bị khuyên dùng */}
      <View style={[styles.recoCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
        <View style={styles.recoHeader}>
          <FontAwesome5 name="star" size={13} color={colors.primary} solid />
          <Text style={[styles.recoTitle, { color: colors.primary }]}>{t('obd.guide_reco_title')}</Text>
        </View>
        <Text style={[styles.recoBody, { color: colors.text }]}>{t('obd.guide_reco_body')}</Text>
        <View style={styles.recoWarnRow}>
          <FontAwesome5 name="exclamation-triangle" size={11} color="#B45309" solid style={{ marginTop: 2 }} />
          <Text style={styles.recoWarn}>{t('obd.guide_reco_warn')}</Text>
        </View>
      </View>

      {/* Xử lý sự cố (thu gọn) */}
      <TouchableOpacity
        style={[styles.troubleToggle, { backgroundColor: colors.card }]}
        onPress={() => setShowTrouble((v) => !v)}
        activeOpacity={0.7}>
        <FontAwesome5 name="question-circle" size={13} color={colors.textSecondary} />
        <Text style={[styles.troubleToggleText, { color: colors.text }]}>{t('obd.guide_trouble_title')}</Text>
        <FontAwesome5 name={showTrouble ? 'chevron-up' : 'chevron-down'} size={11} color={colors.textSecondary} />
      </TouchableOpacity>
      {showTrouble && (
        <View style={[styles.troubleBody, { backgroundColor: colors.card }]}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={styles.troubleRow}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>•</Text>
              <Text style={[styles.troubleText, { color: colors.textSecondary }]}>
                {t(`obd.guide_trouble_${n}` as any)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  needCard: { borderRadius: 12, padding: 14, marginBottom: 14 },
  needTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  needRow: { flexDirection: 'row', justifyContent: 'space-around' },
  needItem: { alignItems: 'center', flex: 1, gap: 6 },
  needIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  needLabel: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  stepCard: { borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  illustration: { width: '100%', height: 150 },
  illustrationPlaceholder: { alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1 },
  stepBody: { padding: 14 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  stepDesc: { fontSize: 13, lineHeight: 20 },
  recoCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  recoHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  recoTitle: { fontSize: 14, fontWeight: '700' },
  recoBody: { fontSize: 13, lineHeight: 20 },
  recoWarnRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  recoWarn: { flex: 1, color: '#B45309', fontSize: 12, lineHeight: 17, fontWeight: '500' },
  troubleToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  troubleToggleText: { flex: 1, fontSize: 13, fontWeight: '600' },
  troubleBody: {
    borderRadius: 10, paddingHorizontal: 14, paddingBottom: 12, paddingTop: 2, marginTop: 2, gap: 8,
  },
  troubleRow: { flexDirection: 'row', gap: 8 },
  troubleText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
});
