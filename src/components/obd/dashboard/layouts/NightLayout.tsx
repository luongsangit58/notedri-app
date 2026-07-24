import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { monoFontFamily } from '../../../../theme/fonts';
import { useT } from '../../../../i18n';
import { CockpitLayoutProps } from '../types';
import { FEATURED_SECONDARY_KEYS } from '../../../../constants/obdMetrics';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

// Premium "Ban đêm" - bản sắc CỐ ĐỊNH (đơn sắc trên nền đen tuyệt đối),
// nguyên lý buồng lái máy bay ban đêm, giữ mắt quen bóng tối khi lái xa -
// không đổi theo theme sáng/tối app (đây LÀ chế độ tối, luôn tối).
// Rà soát 24/7 (góp ý user: đỏ trên đen khó đọc, số không sắc nét) - đổi
// sang hổ phách/vàng cam (amber), vẫn giữ đúng nguyên lý ánh sáng ấm/bước
// sóng dài bảo vệ thị lực đêm như cách phi công dùng, nhưng độ sáng/tương
// phản với nền đen cao hơn hẳn đỏ thuần (mắt người nhạy với vàng-cam hơn đỏ
// ở điều kiện thiếu sáng) - dễ đọc số hơn mà không mất tinh thần "buồng lái
// ban đêm" ban đầu.
const PALETTE = { bg: '#000000', red: '#FFB300', redDim: '#8A6100' };

function MiniStat({ label, value, unit, textSize, valSize, animate }: {
  label: string;
  value: number | null;
  unit: string;
  textSize: number;
  valSize: number;
  animate?: boolean;
}) {
  const display = useCountingNumber(value, 1, animate);
  return (
    <View style={styles.mini}>
      <Text style={[styles.miniLabel, { color: PALETTE.redDim, fontFamily: monoFontFamily, fontSize: textSize }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.miniVal, { color: PALETTE.red, fontFamily: monoFontFamily, fontSize: valSize }]} numberOfLines={1}>
        {display ?? '-'}{unit}
      </Text>
    </View>
  );
}

// Rà soát 24/7 (góp ý user: số quá nhỏ so với màn hình to trên đầu xe) -
// layout này trước đó KHÔNG nhận `size` (gaugeSize), chữ khoá cứng 60px bất
// kể màn hình to bao nhiêu - chưa ăn theo lần nâng trần gaugeSize
// (useCockpitLayout.ts). Nhận `size` và tỉ lệ theo nó như mọi layout khác.
export default function NightLayout({ metrics, size, isPortrait, animate = true }: CockpitLayoutProps) {
  const t = useT();
  const speed = metrics.find((m) => m.def.key === 'speedKmh');
  const secondary = metrics.filter((m) => m.def.key !== 'speedKmh');
  const speedDisplay = useCountingNumber(speed?.value ?? null, 0, animate);
  const featured = FEATURED_SECONDARY_KEYS
    .map((k) => secondary.find((s) => s.def.key === k))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const speedValSize = Math.max(60, Math.min(160, size * 0.6));
  const secondaryTextSize = Math.max(9, Math.min(16, size * 0.05));
  const miniValSize = Math.max(15, Math.min(24, size * 0.08));

  return (
    <View style={[styles.root, { backgroundColor: PALETTE.bg }, isPortrait && { paddingVertical: 28 }]}>
      <Text
        style={[styles.speedVal, { color: PALETTE.red, fontFamily: monoFontFamily, textShadowColor: PALETTE.red, fontSize: speedValSize }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {speedDisplay ?? '-'}
      </Text>
      <Text style={[styles.speedUnit, { color: PALETTE.redDim, fontFamily: monoFontFamily }]}>KM/H</Text>

      {featured.length > 0 && (
        <View style={styles.secondaryRow}>
          {featured.map(({ def, value }) => (
            <MiniStat key={def.key} label={t(def.labelKey)} value={value} unit={def.unit} textSize={secondaryTextSize} valSize={miniValSize} animate={animate} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, borderRadius: 18, width: '100%', minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 2 },
  speedVal: { fontSize: 60, fontWeight: '800', letterSpacing: -1, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14 },
  speedUnit: { fontSize: 11, letterSpacing: 2, marginTop: -4 },
  secondaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 22 },
  mini: { alignItems: 'center' },
  miniLabel: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  miniVal: { fontSize: 15, fontWeight: '700', marginTop: 2 },
});
