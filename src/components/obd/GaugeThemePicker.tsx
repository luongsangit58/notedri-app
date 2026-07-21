import React from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
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
  visible, selectedId, onSelect, onClose,
}: { visible: boolean; selectedId: string; onSelect: (id: string) => void; onClose: () => void }) {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);

  // Theme khoá (isPremiumOnly) + user chưa Premium -> dẫn thẳng sang màn nâng
  // cấp có sẵn (không phải xây luồng mua lẻ theo theme - xem comment
  // isPremiumOnly ở gaugeThemes.ts).
  const handlePick = (theme: GaugeTheme) => {
    if (theme.isPremiumOnly && !isPremium) {
      onClose();
      navigation.navigate('Premium');
      return;
    }
    onSelect(theme.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }} onPress={onClose}>
        <Pressable style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, marginBottom: 12 }}>
            {t('obd.gauge_theme_picker_title')}
          </Text>
          {GAUGE_THEMES.map((theme) => {
            const locked = !!theme.isPremiumOnly && !isPremium;
            const active = theme.id === selectedId;
            return (
              <TouchableOpacity
                key={theme.id}
                onPress={() => handlePick(theme)}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 12, borderRadius: 12, marginBottom: 8,
                  backgroundColor: active ? theme.accent + '22' : colors.card,
                  borderWidth: active ? 1.5 : 0, borderColor: theme.accent,
                }}>
                <Dial value={PREVIEW_VALUE} min={0} max={220} accent={theme.accent} size={56} animate={false} />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{theme.name}</Text>
                {locked ? (
                  <FontAwesome5 name="lock" size={14} color={colors.textSecondary} solid />
                ) : active ? (
                  <FontAwesome5 name="check-circle" size={16} color={theme.accent} solid />
                ) : null}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={onClose} style={{ marginTop: 4, alignItems: 'center', padding: 8 }}>
            <Text style={{ color: colors.textSecondary }}>{t('common.close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
