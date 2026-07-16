import React, { useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView, ImageSourcePropType, NativeSyntheticEvent, NativeScrollEvent, LayoutChangeEvent } from 'react-native';
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
  { icon: 'plug' },
  { icon: 'lightbulb' },
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
      <View style={styles.slideInner}>
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
  // ĐO bề rộng THẬT bằng onLayout thay vì đoán qua useWindowDimensions() - padding
  // (sửa 15/7: đoán sai làm carousel lệch trái + vuốt "next" nhảy thẳng ảnh cuối -
  // cùng gốc lỗi với ảnh gộp cũ hiện quá to hồi trước: ScrollView cha đặt padding
  // qua prop `style` chứ không phải `contentContainerStyle`, nên bề rộng nội dung
  // khả dụng thực tế KHÔNG bằng screenWidth trừ padding tính tay). onLayout luôn
  // cho đúng con số Yoga đã tính, dùng con số đó cho CẢ bề rộng slide LẪN mốc
  // snapToInterval/scrollTo - khớp tuyệt đối, pagingEnabled tính đúng trang.
  const [carouselWidth, setCarouselWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== carouselWidth) setCarouselWidth(w);
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!carouselWidth) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  function goTo(i: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, i));
    scrollRef.current?.scrollTo({ x: clamped * carouselWidth, animated: true });
    setActiveIndex(clamped);
  }

  return (
    <View onLayout={handleLayout}>
      {/* Chưa đo được bề rộng thật (lần render đầu) - không render ScrollView với
          bề rộng đoán sai, đợi 1 nhịp onLayout rồi mới vẽ để không bao giờ lệch. */}
      {carouselWidth > 0 && (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={32}
          // Rà soát 16/7 (user báo vuốt 1 cái nhảy thẳng bước 3-4): pagingEnabled
          // VÀ snapToInterval cùng lúc là 2 cơ chế snap CHỒNG nhau, Android xử lý
          // không nhất quán với vuốt nhanh/mạnh tay - chỉ giữ snapToInterval (đã
          // đúng bằng carouselWidth, đủ để snap từng trang) + decelerationRate
          // "fast" là đủ, bỏ hẳn pagingEnabled để hết xung đột.
          snapToInterval={carouselWidth}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum>
          {STEPS.map((_, i) => (
            <StepSlide key={i} index={i} width={carouselWidth} />
          ))}
        </ScrollView>
      )}

      {/* Nút Trước/Tiếp (rà soát 16/7: vuốt tay không đủ tin cậy, thêm lối bấm
          rõ ràng - đỡ phụ thuộc hoàn toàn vào cử chỉ vuốt) + chấm chỉ số trang. */}
      <View style={styles.navRow}>
        <TouchableOpacity
          onPress={() => goTo(activeIndex - 1)}
          disabled={activeIndex === 0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.navBtn, activeIndex === 0 && styles.navBtnDisabled]}>
          <FontAwesome5 name="chevron-left" size={11} color={activeIndex === 0 ? colors.border : colors.primary} />
        </TouchableOpacity>

        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <TouchableOpacity
              key={i}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              onPress={() => goTo(i)}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: i === activeIndex ? colors.primary : colors.border },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => goTo(activeIndex + 1)}
          disabled={activeIndex === STEPS.length - 1}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.navBtn, activeIndex === STEPS.length - 1 && styles.navBtnDisabled]}>
          <FontAwesome5
            name="chevron-right"
            size={11}
            color={activeIndex === STEPS.length - 1 ? colors.border : colors.primary}
          />
        </TouchableOpacity>
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

      {/* Cần chuẩn bị - rà soát 16/7 (user: dòng "Cần: X · Y · Z" nối bằng dấu
          chấm đọc dài dòng, trình bày không chuyên nghiệp) - đổi 3 mục thành 3
          chip nhỏ riêng biệt, dễ quét mắt hơn 1 câu văn nối chuỗi. */}
      <View style={styles.needChipsRow}>
        {(['adapter', 'engine', 'bluetooth'] as const).map((key) => (
          <View key={key} style={[styles.needChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FontAwesome5
              name={key === 'adapter' ? 'microchip' : key === 'engine' ? 'key' : 'bluetooth-b'}
              size={10} color={colors.textSecondary}
            />
            <Text numberOfLines={1} style={[styles.needChipText, { color: colors.textSecondary }]}>
              {t(`obd.guide_need_${key}` as any)}
            </Text>
          </View>
        ))}
      </View>

      {/* Carousel vuốt ngang: mỗi bước 1 slide (ảnh + text ngắn ngay dưới) */}
      <StepCarousel />

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
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  needChipsRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, marginBottom: 16 },
  needChip: {
    flex: 1, minWidth: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6,
  },
  needChipText: { flexShrink: 1, fontSize: 11, fontWeight: '500' },
  slideInner: { paddingHorizontal: 12 },
  // Cùng lý do không khai width:'100%' như bản cũ (xem comment lịch sử ở git log) -
  // View cha (slide, đã có width cố định = slideWidth) tự stretch đúng bề rộng.
  hero: { aspectRatio: 16 / 10, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  heroImage: { width: '100%', height: '100%' },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  slideTextRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingRight: 0 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 10, marginBottom: 12 },
  navBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navBtnDisabled: { opacity: 0.4 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
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
