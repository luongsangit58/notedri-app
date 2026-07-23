import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../utils/theme';
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

// Rà soát 23/7 (góp ý user: ảnh xem trước "xấu, sai" - card cao bất thường,
// thừa khoảng trống lớn dưới nội dung) - 8 Layout dùng flex:1 để tự lấp ĐẦY
// khung hình thật trên Dashboard (đúng ý, xem GaugeCluster.tsx), nhưng trong
// modal xem trước KHÔNG có khung cha giới hạn chiều cao rõ ràng - flex:1 rơi
// vào 1 khoảng mập mờ của Yoga (không phải luôn co gọn theo nội dung như kỳ
// vọng), khiến card cao vọt lên để trống mảng lớn. Khoá 1 chiều cao CỐ ĐỊNH
// đủ rộng rãi cho mọi style ở đây - cho flex:1 có 1 khung THẬT để lấp đầy,
// giống hệt tình huống Dashboard thật.
const PREVIEW_CARD_HEIGHT = 280;

export default function DashboardStylePicker({
  visible, selectedId, vehicleName, onSelect, onClose,
}: {
  visible: boolean; selectedId: string; vehicleName?: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const layout = useCockpitLayout(true);

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
    setPreviewStyle(null);
  };

  const upgradeFromPreview = () => {
    setPreviewStyle(null);
    onClose();
    navigation.navigate('Premium');
  };

  const locked = !!previewStyle?.isPremiumOnly && !isPremium;
  const PreviewLayout = previewStyle?.Layout;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }} onPress={close}>
        <Pressable style={{ backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '90%', alignSelf: 'center' }}>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {previewStyle && PreviewLayout ? (
              <>
                <TouchableOpacity
                  onPress={() => setPreviewStyle(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, alignSelf: 'flex-start' }}>
                  <FontAwesome5 name="arrow-left" size={13} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('common.back')}</Text>
                </TouchableOpacity>

                <View style={{ alignItems: 'center', paddingVertical: 4 }}>
                  {/* Chiều cao CỐ ĐỊNH (xem PREVIEW_CARD_HEIGHT) để flex:1 của
                      Layout có khung thật để lấp đầy - không mập mờ như trước.
                      isPortrait luôn false ở đây (khác Dashboard thật) - xem
                      trước cố định 1 bố cục gọn/nhất quán, không phụ thuộc
                      đang cầm máy dọc hay ngang lúc mở modal. */}
                  <View style={{ width: '100%', height: PREVIEW_CARD_HEIGHT }}>
                    <PreviewLayout
                      metrics={DEMO_METRICS}
                      size={layout.gaugeSize}
                      ringSize={layout.ringSize}
                      isPortrait={false}
                      animate={false}
                    />
                  </View>

                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 14 }}>{t(previewStyle.nameKey)}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                    {t(previewStyle.descKey)}
                  </Text>
                  {locked && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 8 }}>
                      {t('obd.gauge_theme_locked_note')}
                    </Text>
                  )}
                </View>

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
              </>
            ) : (
              <>
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
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
