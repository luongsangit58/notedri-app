import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { GAUGE_THEMES, GaugeTheme } from '../../utils/gaugeThemes';
import Dial from './Dial';

// Giá trị demo cố định cho ảnh xem trước (không phải số liệu thật) - chọn ~65%
// thang đo để kim lệch rõ khỏi vị trí thẳng đứng, nhìn giống ảnh preview hơn.
const PREVIEW_VALUE = 130;

export default function GaugeThemePicker({
  visible, selectedId, vehicleName, onSelect, onClose,
}: {
  visible: boolean; selectedId: string; vehicleName?: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  // Rà soát (góp ý user: xoay ngang bị lỗi hiển thị) - dialSize preview cố
  // định 190px trước đây không co theo màn hình, tràn trên landscape thấp.
  const { width, height } = useWindowDimensions();
  const previewDialSize = Math.max(130, Math.min(190, Math.min(width, height) * 0.4));

  // Chạm 1 theme -> xem TRƯỚC bản demo to (giống hệt đồng hồ thật trong
  // GaugeCluster), rồi mới bấm xác nhận dùng - trước đây chạm là áp dụng
  // luôn, chỉ có ảnh preview 56px nhỏ trong list (góp ý user: cần xem trước
  // to hơn trước khi chọn).
  const [previewTheme, setPreviewTheme] = useState<GaugeTheme | null>(null);

  const close = () => {
    setPreviewTheme(null);
    onClose();
  };

  const applyPreview = () => {
    if (!previewTheme) return;
    onSelect(previewTheme.id);
    setPreviewTheme(null);
  };

  const upgradeFromPreview = () => {
    setPreviewTheme(null);
    onClose();
    navigation.navigate('Premium');
  };

  const locked = !!previewTheme?.isPremiumOnly && !isPremium;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }} onPress={close}>
        {/* maxHeight + ScrollView bên trong: card cố định trước đây có thể tràn/
            bị cắt trên màn landscape thấp (đầu Android ô tô) khi cộng dồn nút
            back + dial preview + tên theme + nút CTA. */}
        <Pressable style={{ backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '90%', alignSelf: 'center' }}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          {previewTheme ? (
            <>
              <TouchableOpacity
                onPress={() => setPreviewTheme(null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, alignSelf: 'flex-start' }}>
                <FontAwesome5 name="arrow-left" size={13} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('common.back')}</Text>
              </TouchableOpacity>

              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <Dial value={PREVIEW_VALUE} min={0} max={220} label={t('obd.stat_speed')} unit="km/h" accent={previewTheme.accent} size={previewDialSize} animate={false} />
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginTop: 14 }}>{previewTheme.name}</Text>
                {locked && (
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    {t('obd.gauge_theme_locked_note')}
                  </Text>
                )}
              </View>

              {locked ? (
                <TouchableOpacity
                  onPress={upgradeFromPreview}
                  style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 }}>
                  <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 14 }}>
                    {t('obd.gauge_theme_upgrade_cta')}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={applyPreview}
                  style={{ backgroundColor: previewTheme.accent, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 }}>
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
              {/* Nhắc rõ đây là lựa chọn RIÊNG cho xe đang kết nối - lưu theo vehicleId,
                  không áp dụng chung cho mọi xe của user (xem gaugeThemes.ts). */}
              {vehicleName ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 12 }}>
                  {t('obd.gauge_theme_picker_subtitle', { vehicle: vehicleName })}
                </Text>
              ) : (
                <View style={{ marginBottom: 8 }} />
              )}
              {GAUGE_THEMES.map((theme) => {
                const rowLocked = !!theme.isPremiumOnly && !isPremium;
                const active = theme.id === selectedId;
                return (
                  <TouchableOpacity
                    key={theme.id}
                    onPress={() => setPreviewTheme(theme)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      padding: 12, borderRadius: 12, marginBottom: 8,
                      backgroundColor: active ? theme.accent + '22' : colors.card,
                      borderWidth: active ? 1.5 : 0, borderColor: theme.accent,
                    }}>
                    <Dial value={PREVIEW_VALUE} min={0} max={220} accent={theme.accent} size={56} animate={false} />
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{theme.name}</Text>
                    {rowLocked ? (
                      <FontAwesome5 name="lock" size={14} color={colors.textSecondary} solid />
                    ) : active ? (
                      <FontAwesome5 name="check-circle" size={16} color={theme.accent} solid />
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
