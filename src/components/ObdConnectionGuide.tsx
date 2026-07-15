import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ImageSourcePropType } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

/**
 * Hướng dẫn kết nối OBD2 - bản chỉn chu thay cho card 3 dòng chữ cũ (Sang phản
 * hồi 14/7: quá sơ sài).
 *
 * HÌNH MINH HOẠ: dùng MỘT ảnh gộp 2x2 (4 ô đánh số 1-4 khớp 4 bước chữ bên
 * dưới) làm hình lớn ở đầu - ChatGPT sinh sẵn kiểu này (xem prompt trong
 * _bmad-output/CHATGPT-PROMPT-OBD-GUIDE-IMAGES-*.md). THÊM HÌNH: lưu ảnh vào
 * assets/obd-guide/guide-steps.png rồi bỏ comment dòng require dưới đây. Chưa có
 * ảnh thì hiện placeholder, KHÔNG vỡ layout hay crash (require tĩnh của RN ném
 * lỗi nếu file thiếu nên phải để trong biến này).
 */
const GUIDE_HERO: ImageSourcePropType | null =
  require('../../assets/obd-guide/guide-steps.png');

const STEPS: { icon: string }[] = [
  { icon: 'search-location' },
  { icon: 'plug' },
  { icon: 'key' },
  { icon: 'bluetooth-b' },
];

function GuideHero() {
  const colors = useColors();
  const t = useT();

  if (GUIDE_HERO) {
    // Image BỌC trong View, không đặt style kích thước thẳng lên Image (sửa 15/7:
    // ảnh vẫn hiện quá to/cắt cụt góc bước 1 dù đã set aspectRatio+contain). Trên
    // Android, <Image> không nhận width qua Yoga stretch đáng tin cậy như <View> -
    // thiếu width tường minh, nó có xu hướng co theo KÍCH THƯỚC GỐC của file
    // (guide-steps.png 1586x992px thật) rồi bị overflow:hidden cắt còn đúng góc
    // trên-trái. Để View (stretch chuẩn, giống mọi card khác trong file này) quyết
    // định kích thước hộp, Image chỉ việc lấp đầy 100% hộp đã có kích thước sẵn.
    return (
      <View style={[styles.hero, { backgroundColor: colors.background }]}>
        <Image
          source={GUIDE_HERO}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>
    );
  }

  // Placeholder tới khi có ảnh thật - giữ khung để layout không nhảy khi gắn ảnh
  return (
    <View style={[styles.hero, styles.heroPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <FontAwesome5 name="images" size={22} color={colors.textSecondary} />
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

      {/* Ảnh minh hoạ gộp 4 bước */}
      <GuideHero />

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

      {/* Các bước (số 1-4 khớp 4 ô trong ảnh gộp phía trên) */}
      {STEPS.map((step, i) => (
        <View key={i} style={[styles.stepCard, { backgroundColor: colors.card }]}>
          <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
            <Text style={styles.stepNumText}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.stepHeader}>
              <FontAwesome5 name={step.icon} size={13} color={colors.primary} />
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
  // KHÔNG khai width: '100%' - ScrollView cha đặt paddingHorizontal qua prop `style` (không
  // phải contentContainerStyle), trên Android width phần trăm của con có thể tính theo chiều
  // rộng CHƯA trừ padding đó -> ảnh tràn rộng hơn các card khác cùng cấp. Để mặc định
  // alignItems:'stretch' của flex tự co giãn đúng bề rộng khả dụng, giống mọi card khác
  // trong file này (statusCard, stepCard...) không khai width tường minh.
  hero: { aspectRatio: 16 / 10, borderRadius: 12, marginBottom: 14, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  needCard: { borderRadius: 12, padding: 14, marginBottom: 14 },
  needTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  needRow: { flexDirection: 'row', justifyContent: 'space-around' },
  needItem: { alignItems: 'center', flex: 1, gap: 6 },
  needIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  needLabel: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  stepCard: {
    flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'flex-start',
  },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 },
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
