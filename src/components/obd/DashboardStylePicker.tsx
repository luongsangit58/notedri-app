import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../utils/theme';
import { useCockpitPalette } from '../../theme/cockpitPalettes';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { DASHBOARD_STYLES, DashboardStyleDef } from '../../constants/dashboardStyles';
import { OBD_METRICS } from '../../constants/obdMetrics';
import { useCockpitLayout } from '../../hooks/useCockpitLayout';

// Dữ liệu demo cố định cho ảnh xem trước (không phải số liệu thật) - đúng bộ
// số mẫu trong bản thiết kế artifact (Honda Jazz V 2017), đủ 8 chỉ số nên
// người dùng thấy ĐÚNG những gì Dashboard thật sẽ hiển thị, không phải minh
// hoạ rút gọn.
const DEMO_VALUES: Record<string, number> = {
  speedKmh: 62, rpm: 2250, engineLoadPct: 34, coolantTempC: 89,
  fuelLevelPct: 58, oilTempC: 96, throttlePct: 18, controlModuleVoltage: 14.2,
};
const DEMO_METRICS = OBD_METRICS.map((def) => ({ def, value: DEMO_VALUES[def.key] ?? null }));

export default function DashboardStylePicker({
  visible, selectedId, vehicleName, onSelect, onClose,
}: {
  visible: boolean; selectedId: string; vehicleName?: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  const cockpitColors = useCockpitPalette();
  const t = useT();
  const navigation = useNavigation<any>();
  // Rà soát 24/7 (góp ý user: liệu bản demo full màn hình này có lỗi hiển thị
  // trên đầu Android ô tô không?) - áp dụng ĐÚNG biện pháp phòng ngừa đã dùng
  // ở OBDDashboardScreen.tsx thật: 1 số ROM đầu xe báo insets top/bottom sai
  // lệch rất lớn (hàng trăm dp) do tính nhầm thanh điều hướng riêng của hãng
  // vào "safe area" - không chặn trần ở đây thì nút Quay lại/khoảng đệm dưới
  // sẽ bị đẩy lệch bất thường, tái diễn đúng lỗi "chưa full màn hình" vừa sửa.
  const rawInsets = useSafeAreaInsets();
  const MAX_SAFE_INSET = 64;
  const insets = {
    top: Math.min(rawInsets.top, MAX_SAFE_INSET),
    bottom: Math.min(rawInsets.bottom, MAX_SAFE_INSET),
  };
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  // Rà soát 24/7 (góp ý user: ảnh xem trước chỉ là "hình đại diện" bé xíu
  // trong 1 thẻ 280dp cố định, không giống thật, còn bị lỗi hiển thị) - bỏ
  // hẳn kiểu xem trước thu nhỏ trong hộp thoại, XEM TOÀN MÀN HÌNH THẬT bằng
  // đúng useCockpitLayout() (không truyền preview=true) - cùng công thức
  // tính gaugeSize/ringSize/isPortrait với Dashboard thật (GaugeCluster.tsx),
  // nên WYSIWYG tuyệt đối, không lệch tỉ lệ so với lúc kết nối OBD2 thật.
  const layout = useCockpitLayout();

  // Chạm 1 style -> xem TRƯỚC bản demo TO, render bằng ĐÚNG component Layout
  // thật (không viết lại JSX riêng như file cũ) - WYSIWYG, không lệch với
  // Dashboard thật.
  const [previewStyle, setPreviewStyle] = useState<DashboardStyleDef | null>(null);

  const close = () => {
    setPreviewStyle(null);
    onClose();
  };

  const applyPreview = () => {
    if (!previewStyle) return;
    onSelect(previewStyle.id);
    // Rà soát 24/7 (góp ý user: bấm "Dùng theme này" xong vẫn chưa ra OBD2
    // Live ngay, phải bấm thêm 1 lần ra ngoài modal mới thấy) - đóng hẳn modal
    // luôn (close(), không chỉ reset previewStyle) để quay thẳng về Dashboard.
    close();
  };

  const upgradeFromPreview = () => {
    setPreviewStyle(null);
    onClose();
    navigation.navigate('Premium');
  };

  const locked = !!previewStyle?.isPremiumOnly && !isPremium;
  const PreviewLayout = previewStyle?.Layout;

  if (previewStyle && PreviewLayout) {
    // Rà soát 24/7: xem trước TOÀN MÀN HÌNH (không transparent, không còn hộp
    // thoại nhỏ giữa màn) - nền dùng ĐÚNG màu cockpit thật (useCockpitPalette,
    // vd luôn tối mặc định) để đúng cảm giác Dashboard thật, không phải nền
    // colors.surface của theme app chung.
    // statusBarTranslucent: BẮT BUỘC trên Android - mặc định Modal vẽ DƯỚI
    // status bar, để lộ 1 dải trống phía trên dù nội dung bên trong đã full -
    // đúng loại lỗi "chưa full màn hình" cần tránh ở đây.
    return (
      <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={() => setPreviewStyle(null)}>
        <StatusBar hidden />
        <View style={{ flex: 1, backgroundColor: cockpitColors.bg }}>
          <View style={{ flex: 1, padding: 8 }}>
            <PreviewLayout
              metrics={DEMO_METRICS}
              size={layout.gaugeSize}
              ringSize={layout.ringSize}
              isPortrait={layout.isPortrait}
              animate
            />
          </View>

          <TouchableOpacity
            onPress={() => setPreviewStyle(null)}
            style={{
              position: 'absolute', top: insets.top + 10, left: 14,
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: '#0007', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
            }}>
            <FontAwesome5 name="arrow-left" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{t('common.back')}</Text>
          </TouchableOpacity>

          <View style={{
            backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 16, paddingBottom: Math.max(16, insets.bottom),
          }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{t(previewStyle.nameKey)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 4, lineHeight: 18 }}>
              {t(previewStyle.descKey)}
            </Text>
            {locked && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
                {t('obd.gauge_theme_locked_note')}
              </Text>
            )}

            {locked ? (
              <TouchableOpacity
                onPress={upgradeFromPreview}
                style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 14 }}>
                  {t('obd.gauge_theme_upgrade_cta')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={applyPreview}
                style={{ backgroundColor: previewStyle.previewColor, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                  {t('obd.gauge_theme_apply_cta')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }} onPress={close}>
        <Pressable style={{ backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '90%', alignSelf: 'center' }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 2 }}>
                  {t('obd.gauge_theme_picker_title')}
                </Text>
                {/* Lựa chọn RIÊNG cho xe đang kết nối - lưu theo vehicleId, không
                    áp dụng chung cho mọi xe của user (xem dashboardStyles.ts). */}
                {vehicleName ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
                    {t('obd.gauge_theme_picker_subtitle', { vehicle: vehicleName })}
                  </Text>
                ) : (
                  <View style={{ marginBottom: 8 }} />
                )}
                {DASHBOARD_STYLES.filter((style) => !style.hiddenFromPicker).map((style) => {
                  const rowLocked = style.isPremiumOnly && !isPremium;
                  const active = style.id === selectedId;
                  return (
                    <TouchableOpacity
                      key={style.id}
                      onPress={() => setPreviewStyle(style)}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        padding: 12, borderRadius: 12, marginBottom: 8,
                        backgroundColor: active ? style.previewColor + '22' : colors.card,
                        borderWidth: active ? 1.5 : 0, borderColor: style.previewColor,
                      }}>
                      <View style={{
                        width: 44, height: 44, borderRadius: 10, backgroundColor: style.previewColor + '22',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <FontAwesome5 name="tachometer-alt" size={18} color={style.previewColor} solid />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{t(style.nameKey)}</Text>
                        {!style.isPremiumOnly && (
                          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>{t('obd.dashboard_style_free_badge')}</Text>
                        )}
                      </View>
                      {rowLocked ? (
                        <FontAwesome5 name="lock" size={14} color={colors.textSecondary} solid />
                      ) : active ? (
                        <FontAwesome5 name="check-circle" size={16} color={style.previewColor} solid />
                      ) : (
                        <FontAwesome5 name="chevron-right" size={13} color={colors.textSecondary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity onPress={close} style={{ marginTop: 4, alignItems: 'center', padding: 8 }}>
                  <Text style={{ color: colors.textSecondary }}>{t('common.close')}</Text>
                </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
