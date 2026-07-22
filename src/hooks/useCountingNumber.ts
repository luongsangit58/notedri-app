import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

// Hiệu ứng số "đếm" mượt khi giá trị đổi - khớp cách kim/cung đồng hồ CHUYỂN
// ĐỘNG trong bản thiết kế artifact (góp ý user: bản đầu chỉ có kim/cung chạy
// mượt, con số thì nhảy khựng sang giá trị mới ngay lập tức). Dùng chung cho
// MỌI số liệu hiển thị trong Dashboard OBD2 - cả đồng hồ kim lẫn số liệu phụ
// dạng thẻ/ring. Snap thẳng ở lần hiển thị ĐẦU TIÊN (không đếm từ 0 lên khi
// vừa mở màn hình - chỉ đếm mượt giữa 2 lần cập nhật số liệu sống).
export function useCountingNumber(value: number | null, decimals = 0, animate = true): number | null {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<number | null>(value);
  const initialized = useRef(false);

  useEffect(() => {
    if (value == null) { setDisplay(null); return; }
    const factor = 10 ** decimals;
    if (!animate || !initialized.current) {
      anim.setValue(value);
      setDisplay(Math.round(value * factor) / factor);
      initialized.current = true;
      return;
    }
    const id = anim.addListener(({ value: v }) => {
      setDisplay(Math.round(v * factor) / factor);
    });
    Animated.timing(anim, {
      toValue: value, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate, decimals]);

  return display;
}
