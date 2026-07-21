import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '../../utils/theme';

// Tách riêng khỏi GaugeCluster để GaugeThemePicker dùng lại làm ảnh xem trước
// theme (mini dial) mà không tạo import vòng (GaugeCluster <-> GaugeThemePicker).

// Kim quét 270° bắt đầu từ -135° (giờ 7-8h) qua đỉnh (12h, 0°) tới +135° (giờ
// 4-5h) - đúng hình dáng đồng hồ tốc độ/vòng tua cơ khí quen thuộc.
const SWEEP_DEG = 270;
const START_DEG = -135;

// Rà soát (góp ý user: mặt đồng hồ trông "thô", chưa chuyên nghiệp) - 9 vạch
// chia độ đều trên cung 270° (giống đồng hồ cơ thật, không cần label từng vạch,
// chỉ cần MIN/MAX ở 2 đầu là đủ định vị). Ẩn ở size nhỏ (mini preview 56px) vì
// dày đặc quá ở kích thước đó trông rối hơn là rõ ràng.
const TICK_COUNT = 9;
const TICK_ANGLES = Array.from({ length: TICK_COUNT }, (_, i) => START_DEG + (i / (TICK_COUNT - 1)) * SWEEP_DEG);

function valueToAngle(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = (clamped - min) / (max - min);
  return START_DEG + pct * SWEEP_DEG;
}

export default function Dial({
  value, min, max, label, unit, accent, size, animate = true,
}: {
  value: number | null; min: number; max: number; label?: string; unit?: string; accent: string; size: number;
  // false cho ảnh xem trước tĩnh trong GaugeThemePicker - không cần animate,
  // không cần useEffect chạy lại mỗi lần list re-render.
  animate?: boolean;
}) {
  const colors = useColors();
  const targetAngle = valueToAngle(value ?? min, min, max);
  const angle = useRef(new Animated.Value(targetAngle)).current;

  useEffect(() => {
    if (!animate) { angle.setValue(targetAngle); return; }
    Animated.timing(angle, {
      toValue: targetAngle,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetAngle, animate]);

  // Kim vẽ bằng View thuần (không cần react-native-svg): xoay quanh TÂM đồng hồ
  // bằng cách bọc kim trong 1 khung vuông cạnh = 2*needleLength có TÂM trùng
  // tâm mặt đồng hồ - transform rotate của RN luôn xoay quanh tâm của chính
  // element, nên xoay cả khung (không phải riêng thanh kim) mới đúng trục.
  const rotate = angle.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] });
  const needleLength = size / 2 - size * 0.095;
  const display = value != null ? Math.round(value) : null;
  const showReadout = size >= 100;
  const showTicks = size >= 100;

  return (
    <View style={[
      styles.dial,
      {
        width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.03),
        backgroundColor: colors.card, borderColor: accent + '55',
        // Đổ bóng tạo chiều sâu - trước đây mặt đồng hồ phẳng lỳ, trông như 1
        // hình tròn vẽ tay hơn là 1 mặt kính đồng hồ thật.
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
        elevation: 6,
      },
    ]}>
      {/* Vạch chia độ quanh viền trong - chỉ cần vạch, không cần số ở mỗi vạch
          (MIN/MAX 2 đầu đã đủ định vị, giống đồng hồ cơ thật). */}
      {showTicks && TICK_ANGLES.map((deg, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}>
          <View style={{
            width: Math.max(1.5, size * 0.012), height: size * 0.08, marginTop: size * 0.05,
            backgroundColor: colors.textSecondary, borderRadius: 1, opacity: 0.55,
          }} />
        </View>
      ))}

      {/* Sheen kính - dải sáng chéo góc trên-trái mờ dần, giả lập ánh phản
          chiếu trên mặt kính cong thay vì màu phẳng 1 khối. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
        start={{ x: 0.15, y: 0.05 }} end={{ x: 0.6, y: 0.6 }}
        style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2 }}
      />

      {showReadout && (
        <>
          <Text style={[styles.minMax, { color: colors.textSecondary, bottom: size * 0.1, left: size * 0.12 }]}>{min}</Text>
          <Text style={[styles.minMax, { color: colors.textSecondary, bottom: size * 0.1, right: size * 0.12 }]}>{max}</Text>
        </>
      )}

      <View style={{
        position: 'absolute',
        width: needleLength * 2, height: needleLength * 2,
        left: size / 2 - needleLength, top: size / 2 - needleLength,
      }}>
        <Animated.View style={{ width: needleLength * 2, height: needleLength * 2, alignItems: 'center', transform: [{ rotate }] }}>
          <View style={{ width: Math.max(2, size * 0.02), height: needleLength, backgroundColor: accent, borderRadius: 2 }} />
        </Animated.View>
      </View>
      <View style={[styles.pivot, { width: size * 0.07, height: size * 0.07, borderRadius: size * 0.035, backgroundColor: accent }]} />

      {showReadout && (
        <View style={[styles.readout, { top: size * 0.58 }]}>
          <Text style={[styles.value, { color: colors.text }]}>{display ?? '-'}</Text>
          <Text style={[styles.unit, { color: colors.textSecondary }]}>{unit}</Text>
          {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dial: { alignItems: 'center', justifyContent: 'center' },
  minMax: { position: 'absolute', fontSize: 11, fontWeight: '600' },
  pivot: { position: 'absolute' },
  readout: { position: 'absolute', alignItems: 'center' },
  value: { fontSize: 30, fontWeight: '800' },
  unit: { fontSize: 11, marginTop: -2 },
  label: { fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
});
