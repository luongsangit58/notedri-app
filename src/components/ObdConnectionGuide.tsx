import React, { useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, ImageSourcePropType, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

/**
 * Hướng dẫn kết nối OBD2 - bản chỉn chu thay cho card 3 dòng chữ cũ (Sang phản
 * hồi 14/7: quá sơ sài). Sửa 15/7 (phản hồi): 1 ảnh gộp 2x2 + 4 khối text xếp
 * dọc bên dưới làm trang quá dài -> đổi sang carousel vuốt ngang, mỗi bước 1
 * slide (1 ảnh riêng + text ngắn ngay dưới), có chấm chỉ số trang.
 *
 * 4 ảnh step-1..4.png được CẮT SẴN từ ảnh gộp cũ (guide-steps.png, ChatGPT sinh,
 * xem _bmad-output/CHATGPT-PROMPT-OBD-GUIDE-IMAGES-*.md) theo đúng 4 góc phần
 * tư 793x496 mỗi ảnh - không sinh ảnh mới, giữ nguyên nội dung minh hoạ đã duyệt.
 */
const STEP_IMAGES: (ImageSourcePropType | null)[] = [
  require('../../assets/obd-guide/step-1.png'),
  require('../../assets/obd-guide/step-2.png'),
  require('../../assets/obd-guide/step-3.png'),
  require('../../assets/obd-guide/step-4.png'),
];

const STEPS: { icon: string }[] = [
  { icon: 'search-location' },
  { icon: 'plug' },
  { icon: 'key' },
  { icon: 'bluetooth-b' },
];

function StepSlide({ index, width }: { index: number; width: number }) {
  const colors = useColors();
  const t = useT();
  const image = STEP_IMAGES[index];
  const step = STEPS[index];

  return (
    <View style={{ width }}>
      <View style={[styles.slideInner, { paddingHorizontal: 2 }]}>
        {/* Ảnh riêng của bước này - View bọc ngoài quyết định kích thước (stretch
            chuẩn), Image chỉ lấp đầy 100% (bài học 15/7: Image không nhận width
            qua Yoga đáng tin cậy như View, thiếu bọc sẽ co theo kích thước gốc
            file rồi bị overflow:hidden cắt cụt). */}
        {image ? (
          <View style={[styles.hero, { backgroundColor: colors.background }]}>
            <Image source={image} style={styles.heroImage} resizeMode="contain" />
          </View>
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <FontAwesome5 name="images" size={22} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 6 }}>
              {t('obd.guide_img_pending')}
            </Text>
          </View>
        )}

        <View style={styles.slideTextRow}>
          <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
            <Text style={styles.stepNumText}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.stepHeader}>
              <FontAwesome5 name={step.icon} size={13} color={colors.primary} />
              <Text style={[styles.stepTitle, { color: colors.text }]}>
                {t(`obd.guide_s${index + 1}_title` as any)}
              </Text>
            </View>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
              {t(`obd.guide_s${index + 1}_desc` as any)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function StepCarousel() {
  const colors = useColors();
  // Trừ padding ngang màn cha (16*2, xem OBDSetupScreen styles.body) để slide
  // khớp đúng bề rộng khả dụng, không phải bề rộng toàn màn hình.
  const { width: screenWidth } = useWindowDimensions();
  const slideWidth = screenWidth - 32;
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  return (
    <View>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        snapToInterval={slideWidth}
        decelerationRate="fast">
        {STEPS.map((_, i) => (
          <StepSlide key={i} index={i} width={slideWidth} />
        ))}
      </ScrollView>

      {/* Chấm chỉ số trang - chạm 1 chấm để nhảy thẳng tới bước đó */}
      <View style={styles.dotsRow}>
        {STEPS.map((_, i) => (
          <TouchableOpacity
            key={i}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            onPress={() => {
              scrollRef.current?.scrollTo({ x: i * slideWidth, animated: true });
              setActiveIndex(i);
            }}>
            <View
              style={[
                styles.dot,
                { backgroundColor: i === activeIndex ? colors.primary : colors.border },
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>
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

      {/* Carousel vuốt ngang: mỗi bước 1 slide (ảnh + text ngắn ngay dưới) */}
      <StepCarousel />

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
  slideInner: {},
  // Cùng lý do không khai width:'100%' như bản cũ (xem comment lịch sử ở git log) -
  // View cha (slide, đã có width cố định = slideWidth) tự stretch đúng bề rộng.
  hero: { aspectRatio: 16 / 10, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  slideTextRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingRight: 4 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 12, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  needCard: { borderRadius: 12, padding: 14, marginBottom: 14 },
  needTitle: { fontSize: 13, fontWeight: '700', marginBottom: 12 },
  needRow: { flexDirection: 'row', justifyContent: 'space-around' },
  needItem: { alignItems: 'center', flex: 1, gap: 6 },
  needIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  needLabel: { fontSize: 11, textAlign: 'center', lineHeight: 15 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' },
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
