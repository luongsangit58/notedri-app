import { useWindowDimensions } from 'react-native';

export interface CockpitLayout {
  width: number;
  height: number;
  isPortrait: boolean;
  isLandscape: boolean;
  // Đồng hồ kim chính khi layout hiện NHIỀU đồng hồ cạnh nhau (Analog 2 kim,
  // Retro 2 kim) - kích thước phải chia sẻ chiều ngang nên nhỏ hơn.
  gaugeSize: number;
  // Rà soát 24/7 (góp ý user: 1-2 đồng hồ cần TO, gần full màn hình để tạo
  // điểm nhấn/dễ nhìn, nhưng không thô quá) - style chỉ có ĐÚNG 1 đồng hồ làm
  // chủ đạo (Racing/Minimal/Night) không cần chia chỗ với đồng hồ thứ 2 như
  // Analog/Retro, được phép to hơn hẳn `gaugeSize` mà vẫn vừa màn hình.
  heroGaugeSize: number;
  // Thẻ vòng tròn (Lưới thẻ số/Fleet)
  ringSize: number;
}

// 1 NGUỒN DUY NHẤT tính orientation/size theo cạnh NGẮN HƠN của màn hình
// (đúng cho cả 2 hướng xoay) - trước đây có 3 công thức khác nhau lặp lại ở
// OBDDashboardScreen, GaugeCluster, GaugeThemePicker, dễ lệch khi sửa 1 chỗ mà
// quên chỗ kia. `preview=true` dùng cho ảnh xem trước nhỏ trong style picker.
export function useCockpitLayout(preview = false): CockpitLayout {
  const { width, height } = useWindowDimensions();
  const shortSide = Math.min(width, height);
  const isPortrait = height >= width;

  // Rà soát 24/7 (góp ý user: đồng hồ quá nhỏ, để trống mảng lớn trên màn hình
  // đầu Android ô tô 10-13", chụp ảnh thật xác nhận) - trần 190/64dp cũ được
  // tính cho màn điện thoại (shortSide ~380-430dp), đầu xe có shortSide lớn
  // hơn nhiều (thường 600-900dp) nhưng vẫn bị chặn cứng ở mức trần đó, không
  // bao giờ lớn thêm dù màn hình còn rất nhiều chỗ trống. Nâng trần lên đủ
  // cho màn lớn, giữ nguyên hệ số nhân theo shortSide.
  const gaugeSize = preview
    ? Math.max(100, Math.min(150, shortSide * 0.3))
    : Math.max(130, Math.min(340, shortSide * 0.42));
  // Hệ số/trần cao hơn hẳn gaugeSize (0.42/340) - đồng hồ ĐƠN không phải chia
  // chỗ với đồng hồ thứ 2, dùng được nhiều không gian hơn để nổi bật, tự vẫn
  // theo shortSide nên không bao giờ tràn khỏi cạnh ngắn hơn của màn hình.
  const heroGaugeSize = preview
    ? Math.max(120, Math.min(190, shortSide * 0.4))
    : Math.max(180, Math.min(460, shortSide * 0.58));
  const ringSize = preview
    ? Math.max(34, Math.min(46, shortSide * 0.1))
    : Math.max(44, Math.min(110, shortSide * 0.14));

  return { width, height, isPortrait, isLandscape: !isPortrait, gaugeSize, heroGaugeSize, ringSize };
}
