import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

// Hiệu ứng số "đếm" mượt khi giá trị đổi - khớp cách kim/cung đồng hồ CHUYỂN
// ĐỘNG trong bản thiết kế artifact (góp ý user: bản đầu chỉ có kim/cung chạy
// mượt, con số thì nhảy khựng sang giá trị mới ngay lập tức). Dùng chung cho
// MỌI số liệu hiển thị trong Dashboard OBD2 - cả đồng hồ kim lẫn số liệu phụ
// dạng thẻ/ring. Snap thẳng ở lần hiển thị ĐẦU TIÊN (không đếm từ 0 lên khi
// vừa mở màn hình - chỉ đếm mượt giữa 2 lần cập nhật số liệu sống).
// Rà soát 24/7 (góp ý user: vòng tua đã làm tròn về bước 50 nhưng lúc đếm số
// vẫn "nhảy loạn" trước khi ra kết quả) - nguyên nhân: animation nội suy MƯỢT
// qua TỪNG số nguyên giữa giá trị cũ/mới (vd 1300→1301→1302...→1350), trong
// khi số liệu thật (và giá trị đích) luôn là bội số của `step` (RPM step=50) -
// mắt thấy các số "lẻ" không tròn bước lướt qua rất nhanh, đọc như spin số
// hỗn loạn thay vì đếm có chủ đích. `step` (mặc định 1 = không đổi hành vi cũ)
// làm tròn MỖI khung hình animation về đúng bội số của step - vẫn có chuyển
// động (không khựng đổi ngay như trước góp ý 22/7), nhưng chỉ đi qua các mốc
// "sạch" (1300, 1350, 1400...), nhìn có chủ đích/gọn gàng hơn hẳn.
export function useCountingNumber(value: number | null, decimals = 0, animate = true, step = 1): number | null {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState<number | null>(value);
  const initialized = useRef(false);

  useEffect(() => {
    if (value == null) { setDisplay(null); return; }
    const factor = 10 ** decimals;
    const quantize = (n: number) => (step > 1 ? Math.round(n / step) * step : Math.round(n * factor) / factor);
    if (!animate || !initialized.current) {
      anim.setValue(value);
      setDisplay(quantize(value));
      initialized.current = true;
      return;
    }
    const id = anim.addListener(({ value: v }) => {
      setDisplay(quantize(v));
    });
    Animated.timing(anim, {
      toValue: value, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate, decimals, step]);

  return display;
}
