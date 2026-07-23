import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { monoFontFamily } from '../../theme/fonts';
import { useCountingNumber } from '../../hooks/useCountingNumber';

// Nội dung khung PiP = CHÍNH UI Activity lúc đó bị Android thu nhỏ - không
// phải 1 view riêng nó tự vẽ. Header/nút bấm của OBDDashboardScreen không đọc
// được (quá nhỏ) và cũng không bấm được (Android chặn tương tác nội dung
// trong khung PiP), nên khi vào PiP phải đổi HẲN sang layout tối giản này:
// chỉ 2 số to nhất người lái cần liếc qua trong lúc dùng app khác. Tách hẳn
// khỏi 8 style Dashboard OBD2 hiện có - PiP không phải 1 style thứ 9, chỉ là
// 1 lớp UI thay thế toàn màn hình khi isInPip=true (xem OBDDashboardScreen.tsx).
const PALETTE = { bg: '#0A0D13', accent: '#FF8A3D', accent2: '#34D5C4', dim: '#7C879C' };

export default function PipCompactView({
  speedKmh, rpm,
}: {
  speedKmh: number | null;
  rpm: number | null;
}) {
  const speedDisplay = useCountingNumber(speedKmh, 0);
  const rpmDisplay = useCountingNumber(rpm, 0);

  return (
    <View style={styles.root}>
      <View style={styles.col}>
        <Text style={[styles.val, { color: PALETTE.accent }]} numberOfLines={1} adjustsFontSizeToFit>
          {speedDisplay ?? '-'}
        </Text>
        <Text style={[styles.unit, { color: PALETTE.dim }]}>km/h</Text>
      </View>
      <View style={styles.col}>
        <Text style={[styles.val, { color: PALETTE.accent2 }]} numberOfLines={1} adjustsFontSizeToFit>
          {rpmDisplay ?? '-'}
        </Text>
        <Text style={[styles.unit, { color: PALETTE.dim }]}>v/ph</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: PALETTE.bg, alignItems: 'center', justifyContent: 'center' },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  val: { fontFamily: monoFontFamily, fontWeight: '800', fontSize: 48, lineHeight: 52 },
  unit: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 },
});
