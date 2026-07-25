import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Polygon, Circle } from 'react-native-svg';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Cung bán nguyệt trong khung 100x100 - kỹ thuật pathLength="100" (mượn từ
// bản thiết kế artifact): stroke-dashoffset tính thẳng theo % (0-100), không
// cần tự tính chu vi cung. 0% = kim/cung chỉ trái (-90deg), 100% = chỉ phải
// (+90deg), quét qua đỉnh (0deg) ở giữa thang.
const ARC_D = 'M 10 50 A 40 40 0 0 1 90 50';

// Rà soát 24/7 (góp ý user: đồng hồ hiện xấu, chỉ có 1 đường bo tròn dày, chưa
// giống đồng hồ xe thật) - đổi từ 7 vạch trơn sang vạch CHÍNH (có số) + vạch
// PHỤ mảnh xen giữa, đúng kiểu mặt đồng hồ tốc độ/vòng tua ô tô thật.
const MAJOR_COUNT = 6;
const MINOR_PER_GAP = 3;
const MAJOR_ANGLES = Array.from({ length: MAJOR_COUNT }, (_, i) => -90 + (i / (MAJOR_COUNT - 1)) * 180);
const ALL_TICKS: { deg: number; major: boolean }[] = [];
for (let i = 0; i < MAJOR_COUNT - 1; i++) {
  const a0 = MAJOR_ANGLES[i];
  const a1 = MAJOR_ANGLES[i + 1];
  ALL_TICKS.push({ deg: a0, major: true });
  for (let j = 1; j <= MINOR_PER_GAP; j++) {
    ALL_TICKS.push({ deg: a0 + (j / (MINOR_PER_GAP + 1)) * (a1 - a0), major: false });
  }
}
ALL_TICKS.push({ deg: MAJOR_ANGLES[MAJOR_COUNT - 1], major: true });

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
  // Bật/tắt CẢ vạch chia LẪN số trị tại vạch chính (trước đây tách riêng
  // showTicks/showMinMax - gộp làm 1 vì luôn đi cùng nhau trên đồng hồ thật).
  showTicks?: boolean;
  showReadout?: boolean;
  // false cho ảnh xem trước tĩnh trong DashboardStylePicker - không cần
  // animate lại mỗi lần list re-render.
  animate?: boolean;
}

export default function ArcGauge({
  value, min, max, size, label, unit,
  trackColor, fillColor, needleColor, tickColor, valueColor, labelColor, valueFontFamily,
  strokeWidth, quantizeStep = 1, glow = true, showNeedle = true, showTicks = true, showReadout = true,
  animate = true,
}: ArcGaugeProps) {
  // Rà soát 24/7 (góp ý user: cung quá dày trông thô, đồng hồ xe thật có nét
  // mảnh + nhiều chi tiết vạch/số hơn là 1 khối màu to) - giảm hẳn độ dày mặc
  // định, chi tiết chuyển sang vạch chia + số (xem ALL_TICKS ở trên).
  const resolvedStrokeWidth = strokeWidth ?? Math.max(3, Math.min(8, size * 0.026));
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

  const needleLength = size / 2 - size * 0.14;
  // Số liệu ĐẾM mượt theo cùng nhịp với kim/cung (góp ý user: bản đầu chỉ có
  // kim/cung chạy mượt, con số nhảy khựng ngay lập tức) - xem useCountingNumber.
  const display = useCountingNumber(value, 0, animate, quantizeStep);
  // Rà soát 24/7 (góp ý user: chữ/số quá nhỏ, khó đọc trên màn đầu xe) - trần
  // cũ (32/12/12/11) được tính cho gaugeSize tối đa 190dp, giữ nguyên trần đó
  // sẽ vô hiệu hoá việc gaugeSize giờ có thể lên tới 340dp (xem useCockpitLayout).
  const valueFontSize = Math.max(14, Math.min(56, size * 0.17));
  const unitFontSize = Math.max(9, Math.min(18, size * 0.065));
  const labelFontSize = Math.max(9, Math.min(18, size * 0.065));
  const tickLabelSize = Math.max(8, Math.min(15, size * 0.05));

  // Kim thon (đầu nhọn + đuôi đối trọng ngắn) thay vì thanh chữ nhật cũ -
  // vẽ 1 lần bằng Polygon trong hệ toạ độ LOCAL của khung xoay (pivot ở giữa).
  const needleW = needleLength * 2;
  const cx = needleLength;
  const tipY = 0;
  const pivotY = needleLength;
  const tailY = pivotY + needleLength * 0.16;
  const tipHalf = Math.max(0.6, size * 0.003);
  const baseHalf = Math.max(1.4, size * 0.013);
  const tailHalf = baseHalf * 1.2;
  const needlePoints = [
    `${cx - tipHalf},${tipY}`,
    `${cx + tipHalf},${tipY}`,
    `${cx + baseHalf},${pivotY}`,
    `${cx + tailHalf},${tailY}`,
    `${cx - tailHalf},${tailY}`,
    `${cx - baseHalf},${pivotY}`,
  ].join(' ');

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

      {showTicks && ALL_TICKS.map(({ deg, major }, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}
        >
          <View style={{
            width: major ? Math.max(1.5, size * 0.012) : Math.max(1, size * 0.007),
            height: major ? size * 0.06 : size * 0.03,
            marginTop: size * 0.045,
            backgroundColor: tickColor ?? trackColor,
            borderRadius: 1,
            opacity: major ? 0.9 : 0.45,
          }}
          />
        </View>
      ))}

      {/* Số trị tại vạch chính (đầu 0/cuối = min/max, giữa chia đều) - đúng
          kiểu đồng hồ đo ô tô thật thay vì chỉ ghi min/max ở 2 góc dưới. Chữ
          số tự XOAY NGƯỢC lại (transform lồng nhau) để luôn đứng thẳng dù vị
          trí đặt theo góc vạch. */}
      {showTicks && MAJOR_ANGLES.map((deg, i) => {
        const tickValue = Math.round(min + (i / (MAJOR_COUNT - 1)) * (max - min));
        return (
          <View
            key={`lbl-${i}`}
            pointerEvents="none"
            style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}
          >
            <View style={{ marginTop: size * 0.14, transform: [{ rotate: `${-deg}deg` }] }}>
              <Text allowFontScaling={false} style={{ color: tickColor ?? labelColor, fontSize: tickLabelSize, fontWeight: '700' }}>
                {tickValue}
              </Text>
            </View>
          </View>
        );
      })}

      {showNeedle && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', width: needleLength * 2, height: needleLength * 2, left: size / 2 - needleLength, top: size / 2 - needleLength }}
        >
          <Animated.View style={{ width: needleLength * 2, height: needleLength * 2, transform: [{ rotate }] }}>
            <Svg width={needleW} height={needleW} style={StyleSheet.absoluteFillObject}>
              <Polygon points={needlePoints} fill={needleColor ?? fillColor} />
            </Svg>
          </Animated.View>
        </View>
      )}
      {showNeedle && (
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Circle cx={50} cy={50} r={4.2} stroke={needleColor ?? fillColor} strokeWidth={1.4} fill="none" opacity={0.9} />
          <Circle cx={50} cy={50} r={1.6} fill={needleColor ?? fillColor} />
        </Svg>
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
