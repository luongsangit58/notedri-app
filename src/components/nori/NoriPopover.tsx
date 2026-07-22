import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import NoriAvatar from './NoriAvatar';
import { useNoriSummary } from '../../services/nori/noriSummary';

interface NoriPopoverProps {
  visible: boolean;
  onClose: () => void;
  vehicleId: number;
  vehicleName: string;
}

// Bong bóng Nori (rà soát 22/7, góp ý user: Nori bên web là icon nổi bấm ra
// bong bóng, bên app trước đó chỉ có card/avatar tĩnh) - tóm tắt 3 tầng: hôm
// nay / tuần này / xu hướng theo phiên OBD2, rồi trỏ sang 2 màn đã có sẵn đầy
// đủ chi tiết (Health, ObdReport) thay vì lặp lại UI ở đây.
export default function NoriPopover({ visible, onClose, vehicleId, vehicleName }: NoriPopoverProps) {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const { isLoading, mood, topIssueLabel, weekComparison, drivingStats } = useNoriSummary(vehicleId);

  const todayLine = topIssueLabel
    ? t('nori.warn_detail', { issue: topIssueLabel })
    : t(`nori.${mood}` as any);

  const delta = weekComparison?.drivingScoreDelta ?? null;
  const deltaPhrase = delta == null ? ''
    : delta > 0 ? t('nori.week_delta_up', { delta })
    : delta < 0 ? t('nori.week_delta_down', { delta: Math.abs(delta) })
    : t('nori.week_delta_stable');
  const weekScore = weekComparison?.thisWeek.avgDrivingScore ?? null;
  const weekLine = weekScore == null
    ? t('nori.week_no_data')
    : deltaPhrase
    ? `${t('nori.week_score', { score: weekScore })} - ${deltaPhrase}`
    : t('nori.week_score', { score: weekScore });

  const sessionLine = drivingStats
    ? t('nori.session_stats', { n: drivingStats.sessions_counted, score: drivingStats.avg_score })
    : t('nori.session_no_data');

  const goTo = (screen: string) => {
    onClose();
    navigation.navigate(screen, { vehicleId, vehicleName });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: 32,
            gap: 14,
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <NoriAvatar mood={mood} size={40} />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>
              {t('nori.popover_title')}
            </Text>
            {isLoading && <ActivityIndicator size="small" color={colors.textSecondary} />}
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <FontAwesome5 name="times" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <FontAwesome5 name="heartbeat" size={14} color={colors.primary} solid style={{ marginTop: 2 }} />
              <Text style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 19 }}>{todayLine}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <FontAwesome5 name="chart-line" size={14} color={colors.primary} solid style={{ marginTop: 2 }} />
              <Text style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 19 }}>{weekLine}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <FontAwesome5 name="car" size={14} color={colors.primary} solid style={{ marginTop: 2 }} />
              <Text style={{ color: colors.text, fontSize: 13, flex: 1, lineHeight: 19 }}>{sessionLine}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => goTo('Health')}
              style={{ flex: 1, backgroundColor: colors.primary + '18', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{t('nori.cta_health')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => goTo('ObdReport')}
              style={{ flex: 1, backgroundColor: colors.primary + '18', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 12 }}>{t('nori.cta_obd_report')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
