import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import RingProgress from '../primitives/RingProgress';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';

// Premium · Doanh nghiệp "Thương hiệu riêng" - khung UI cho gara/hãng
// taxi/đội xe, bán theo hợp đồng B2B riêng (không theo user lẻ). Badge logo
// CHỈ là placeholder - luồng upload logo/màu thương hiệu thật là 1 tính năng
// backend/hợp đồng riêng, ngoài phạm vi UI lần này (đúng comment gốc trong
// gaugeThemes.ts về premium-gate là bước tối thiểu).
const PALETTE = { bg1: '#1A1A1A', bg2: '#2B2B2B', surface: '#232323', border: '#3A3A3A', text: '#F5F5F5', textDim: '#9CA3AF', accent: '#9CA3AF' };

export default function FleetLayout({ metrics, ringSize, isPortrait, animate }: CockpitLayoutProps) {
  const t = useT();
  const cols = isPortrait ? 2 : 4;

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg2 }]}>
      <View style={[styles.badge, { borderColor: PALETTE.textDim }]}>
        <Text style={[styles.badgeText, { color: PALETTE.textDim }]}>LOGO{'\n'}GARA</Text>
      </View>

      <View style={styles.grid}>
        {metrics.map(({ def, value }) => (
          <View key={def.key} style={{ width: `${100 / cols}%`, padding: 6 }}>
            <View style={[styles.card, { backgroundColor: PALETTE.surface, borderColor: PALETTE.border }]}>
              <RingProgress value={value} max={def.max} size={ringSize} trackColor={PALETTE.border} fillColor={PALETTE.accent} animate={animate}>
                <FontAwesome5 name={def.icon} size={ringSize * 0.32} color={PALETTE.accent} solid />
              </RingProgress>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.val, { color: PALETTE.text }]} numberOfLines={1}>
                  {value != null ? Math.round(value * 10) / 10 : '-'}
                  <Text style={{ fontSize: 10, fontWeight: '600', color: PALETTE.textDim }}> {def.unit}</Text>
                </Text>
                <Text style={[styles.label, { color: PALETTE.textDim }]} numberOfLines={1}>{t(def.labelKey)}</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: 18, padding: 14, gap: 12, width: '100%' },
  badge: { alignSelf: 'flex-start', width: 48, height: 48, borderRadius: 10, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.4, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12 },
  val: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
});
