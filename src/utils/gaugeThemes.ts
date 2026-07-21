import AsyncStorage from '@react-native-async-storage/async-storage';

// Registry theme cho màn "Đồng hồ" OBD (GaugeCluster). MVP chỉ có theme mặc
// định + 2 theme màu minh hoạ cơ chế khoá/mua, tất cả vẽ bằng View thuần
// (không cần ảnh/SVG) - dialImage/needleImage/logoImage để trống, chờ bộ ảnh
// dial thật (bán riêng theo hãng xe) thả vào sau mà không phải đổi code
// GaugeCluster: theme nào có dialImage thì tự hiển thị ảnh thay vì hình vẽ mặc định.
export interface GaugeTheme {
  id: string;
  name: string;
  accent: string;
  // Gợi ý theme theo hãng xe (vehicle.make) - dùng để tự chọn theme phù hợp
  // hoặc làm điểm bán theo logo hãng sau này.
  brands?: string[];
  // Khoá theo gói Premium hiện có (is_premium) - CHƯA phải mua lẻ theo theme,
  // đó là 1 quyết định sản phẩm/backend riêng (SKU + luồng thanh toán mới,
  // ngoài phạm vi phần khung này). Premium-gate là bước tối thiểu hợp lý để
  // có "khoá + CTA mua" hoạt động thật ngay, không phải xây cả hệ thống mới.
  isPremiumOnly?: boolean;
  dialImage?: number; // require('...') - chưa có ảnh, để undefined
  needleImage?: number;
  logoImage?: number;
}

export const GAUGE_THEMES: GaugeTheme[] = [
  { id: 'default', name: 'Mặc định', accent: '#3B82F6' },
  { id: 'sport', name: 'Thể thao', accent: '#EF4444', isPremiumOnly: true },
  { id: 'classic', name: 'Cổ điển', accent: '#D97706', isPremiumOnly: true },
];

export function pickGaugeTheme(id?: string | null): GaugeTheme {
  return GAUGE_THEMES.find((th) => th.id === id) ?? GAUGE_THEMES[0];
}

export function pickGaugeThemeForVehicle(vehicleMake?: string | null): GaugeTheme {
  if (vehicleMake) {
    const match = GAUGE_THEMES.find((th) =>
      th.brands?.some((b) => b.toLowerCase() === vehicleMake.toLowerCase())
    );
    if (match) return match;
  }
  return GAUGE_THEMES[0];
}

const SELECTED_THEME_KEY = 'obd_gauge_theme_id';

export async function getSelectedGaugeThemeId(): Promise<string> {
  return (await AsyncStorage.getItem(SELECTED_THEME_KEY).catch(() => null)) ?? 'default';
}

export async function setSelectedGaugeThemeId(id: string): Promise<void> {
  await AsyncStorage.setItem(SELECTED_THEME_KEY, id).catch(() => {});
}
