import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

interface VoiceWaveformProps {
  /** 0..1, từ useVoiceInput().volume - cường độ âm lượng sống trong lúc đang nghe. */
  volume: number;
  color: string;
  /** Chiều cao tối đa của thanh sóng cao nhất (px). */
  maxHeight?: number;
}

const BAR_COUNT = 5;
// Mỗi thanh phản ứng với volume ở mức độ khác nhau (không phải tất cả cao/thấp cùng lúc) - nhìn
// "sống" hơn 1 khối lên xuống đồng loạt, giống hiệu ứng waveform thật của các app trợ lý giọng
// nói (Kiki, Google Assistant...). Thanh giữa (index 2) nhạy nhất, 2 đầu ít nhạy hơn.
const BAR_SENSITIVITY = [0.5, 0.8, 1, 0.8, 0.5];
const MIN_HEIGHT_RATIO = 0.22; // chiều cao tối thiểu lúc im lặng - không bao giờ phẳng lì 0

/**
 * Hiệu ứng "sóng sánh" thay cho icon mic tĩnh khi đang nghe (docs/nori-agent-plan.md, góp ý user
 * 2026-07-27: muốn giống app Kiki thay vì chỉ đổi màu nút mic). Không cần thư viện animation mới
 * - Animated API có sẵn trong react-native core, cùng cách NoriFloatingButton.tsx đang dùng.
 */
export default function VoiceWaveform({ volume, color, maxHeight = 28 }: VoiceWaveformProps) {
  const bars = useRef(BAR_SENSITIVITY.map(() => new Animated.Value(MIN_HEIGHT_RATIO))).current;

  useEffect(() => {
    const animations = bars.map((bar, i) => {
      const target = Math.max(MIN_HEIGHT_RATIO, Math.min(1, volume * BAR_SENSITIVITY[i]));
      return Animated.timing(bar, {
        toValue: target,
        duration: 90, // ngắn - bám sát nhịp cập nhật volumechange (100ms, xem useVoiceInput.ts)
        useNativeDriver: false, // animate `height` - không hỗ trợ native driver
      });
    });
    Animated.parallel(animations).start();
  }, [volume, bars]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: maxHeight, gap: 4 }}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4,
            borderRadius: 2,
            backgroundColor: color,
            height: bar.interpolate({ inputRange: [0, 1], outputRange: [maxHeight * MIN_HEIGHT_RATIO, maxHeight] }),
          }}
        />
      ))}
    </View>
  );
}
