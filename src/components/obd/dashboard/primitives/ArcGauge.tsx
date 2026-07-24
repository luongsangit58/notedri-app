import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Cung bán nguyệt trong khung 100x100 - kỹ thuật pathLength="100" (mượn từ
// bản thiết kế artifact): stroke-dashoffset tính thẳng theo % (0-100), không
// cần tự tính chu vi cung. 0% = kim/cung chỉ trái (-90deg), 100% = chỉ phải
// (+90deg), quét qua đỉnh (0deg) ở giữa thang.
const ARC_D = 'M 10 50 A 40 40 0 0 1 90 50';
const TICK_COUNT = 7;
const TICK_ANGLES = Array.from({ length: TICK_COUNT }, (_, i) => -90 + (i / (TICK_COUNT - 1)) * 180);

export interface ArcGaugeProps {
  value: number | null;
  min: number;
  max: number;
  size: number;
  label?: string;
  unit?: string;
  trackColor: string;
  fillColor: string;
  needleColor?: string;
  tickColor?: string;
  valueColor?: string;
  labelColor?: string;
  valueFontFamily?: string;
  strokeWidth?: number;
  // Bước làm tròn của số liệu (vd RPM=50) - truyền vào để số ĐẾM chỉ đi qua
  // các mốc tròn bước khi đang chạy animation, xem useCountingNumber.
  quantizeStep?: number;
  glow?: boolean;
  showNeedle?: boolean;
  showTicks?: boolean;
  showReadout?: boolean;
  showMinMax?: boolean;
  // false cho ảnh xem trước tĩnh trong DashboardStylePicker - không cần
  // animate lại mỗi lần list re-render.
  animate?: boolean;
}

export default function ArcGauge({
  value, min, max, size, label, unit,
  trackColor, fillColor, needleColor, tickColor, valueColor, labelColor, valueFontFamily,
  strokeWidth, quantizeStep = 1, glow = true, showNeedle = true, showTicks = true, showReadout = true,
  showMinMax = true, animate = true,
}: ArcGaugeProps) {
  // Rà soát 24/7 (góp ý user: nét cung quá mảnh trên đồng hồ to ở đầu xe) -
  // nét cung tỉ lệ theo size khi không truyền cứng, thay vì cố định 9px cho
  // mọi kích thước (9px hợp lý ở gauge 190dp nhưng quá mảnh ở 340dp).
  const resolvedStrokeWidth = strokeWidth ?? Math.max(9, Math.min(18, size * 0.06));
  const clamped = Math.max(min, Math.min(max, value ?? min));
  const frac = max > min ? (clamped - min) / (max - min) : 0;

  const progress = useRef(new Animated.Value(frac)).current;
  useEffect(() => {
    if (!animate) { progress.setValue(frac); return; }
    Animated.timing(progress, {
      toValue: frac, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac, animate]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '90deg'] });

  const needleLength = size / 2 - size * 0.1;
  // Số liệu ĐẾM mượt theo cùng nhịp với kim/cung (góp ý user: bản đầu chỉ có
  // kim/cung chạy mượt, con số nhảy khựng ngay lập tức) - xem useCountingNumber.
  const display = useCountingNumber(value, 0, animate, quantizeStep);
  // Rà soát 24/7 (góp ý user: chữ/số quá nhỏ, khó đọc trên màn đầu xe) - trần
  // cũ (32/12/12/11) được tính cho gaugeSize tối đa 190dp, giữ nguyên trần đó
  // sẽ vô hiệu hoá việc gaugeSize giờ có thể lên tới 340dp (xem useCockpitLayout).
  const valueFontSize = Math.max(14, Math.min(56, size * 0.17));
  const unitFontSize = Math.max(9, Math.min(18, size * 0.065));
  const labelFontSize = Math.max(9, Math.min(18, size * 0.065));
  const minMaxFontSize = Math.max(8, Math.min(16, size * 0.06));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFillObject}>
        <Path d={ARC_D} stroke={trackColor} strokeWidth={resolvedStrokeWidth} strokeLinecap="round" fill="none" />
        <AnimatedPath
          d={ARC_D}
          stroke={fillColor}
          strokeWidth={resolvedStrokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray="100"
          strokeDashoffset={dashOffset as unknown as number}
        />
      </Svg>

      {showTicks && TICK_ANGLES.map((deg, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}
        >
          <View style={{
            width: Math.max(1.5, size * 0.012), height: size * 0.07, marginTop: size * 0.04,
            backgroundColor: tickColor ?? trackColor, borderRadius: 1, opacity: 0.7,
          }}
          />
        </View>
      ))}

      {showNeedle && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', width: needleLength * 2, height: needleLength * 2, left: size / 2 - needleLength, top: size / 2 - needleLength }}
        >
          <Animated.View style={{ width: needleLength * 2, height: needleLength * 2, alignItems: 'center', transform: [{ rotate }] }}>
            <View style={{ width: Math.max(2, size * 0.02), height: needleLength, backgroundColor: needleColor ?? fillColor, borderRadius: 2 }} />
          </Animated.View>
        </View>
      )}
      {showNeedle && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', width: size * 0.07, height: size * 0.07, borderRadius: size * 0.035,
            backgroundColor: needleColor ?? fillColor, left: size / 2 - size * 0.035, top: size / 2 - size * 0.035,
          }}
        />
      )}

      {showMinMax && (
        <>
          <Text allowFontScaling={false} style={[styles.minMax, { color: labelColor, bottom: size * 0.1, left: size * 0.12, fontSize: minMaxFontSize }]}>{min}</Text>
          <Text allowFontScaling={false} style={[styles.minMax, { color: labelColor, bottom: size * 0.1, right: size * 0.12, fontSize: minMaxFontSize }]}>{max}</Text>
        </>
      )}

      {showReadout && (
        <View pointerEvents="none" style={{ position: 'absolute', top: size * 0.58, maxWidth: size * 0.62, alignItems: 'center' }}>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: valueFontSize,
              fontWeight: '800',
              color: valueColor ?? fillColor,
              fontFamily: valueFontFamily,
              textShadowColor: glow ? fillColor : 'transparent',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: glow ? 10 : 0,
            }}
          >
            {display ?? '-'}
          </Text>
          {unit ? <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: unitFontSize, color: labelColor, marginTop: -2 }}>{unit}</Text> : null}
          {label ? <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: labelFontSize, color: labelColor, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  minMax: { position: 'absolute', fontWeight: '600' },
});
