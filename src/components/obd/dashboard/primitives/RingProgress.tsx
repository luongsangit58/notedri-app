import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// viewBox 48x48, bán kính 20 - đúng theo bản thiết kế artifact (thẻ số Style
// B). Xoay -90deg để vòng tiến độ bắt đầu từ đỉnh (12h) thay vì từ bên phải.
const R = 20;
const CIRCUMFERENCE = 2 * Math.PI * R;

export interface RingProgressProps {
  value: number | null;
  max: number;
  size: number;
  trackColor: string;
  fillColor: string;
  strokeWidth?: number;
  // false cho ảnh xem trước tĩnh trong DashboardStylePicker.
  animate?: boolean;
  children?: React.ReactNode;
}

export default function RingProgress({
  value, max, size, trackColor, fillColor, strokeWidth = 5, animate = true, children,
}: RingProgressProps) {
  const frac = max > 0 ? Math.max(0, Math.min(1, (value ?? 0) / max)) : 0;

  const progress = useRef(new Animated.Value(frac)).current;
  useEffect(() => {
    if (!animate) { progress.setValue(frac); return; }
    Animated.timing(progress, {
      toValue: frac, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac, animate]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [CIRCUMFERENCE, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 48 48" style={[StyleSheet.absoluteFillObject, { transform: [{ rotate: '-90deg' }] }]}>
        <Circle cx={24} cy={24} r={R} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={24}
          cy={24}
          r={R}
          stroke={fillColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset as unknown as number}
        />
      </Svg>
      {children}
    </View>
  );
}
