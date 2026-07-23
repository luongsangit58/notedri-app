import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranslationKey } from '../i18n/vi';
import { CockpitLayoutProps } from '../components/obd/dashboard/types';
import AnalogLayout from '../components/obd/dashboard/layouts/AnalogLayout';
import CardsLayout from '../components/obd/dashboard/layouts/CardsLayout';
import RacingLayout from '../components/obd/dashboard/layouts/RacingLayout';
import MinimalLayout from '../components/obd/dashboard/layouts/MinimalLayout';
import RetroLayout from '../components/obd/dashboard/layouts/RetroLayout';
import NightLayout from '../components/obd/dashboard/layouts/NightLayout';
import FamilyLayout from '../components/obd/dashboard/layouts/FamilyLayout';
import FleetLayout from '../components/obd/dashboard/layouts/FleetLayout';

// Registry style Dashboard OBD2 (thay `gaugeThemes.ts` - "3 theme" cũ thực ra
// chỉ là 3 màu accent của cùng 1 mặt đồng hồ, không phải bố cục khác nhau).
// 8 style này lấy đúng từ bản thiết kế artifact: 2 style Miễn phí theo theme
// sáng/tối app, 6 style Premium mỗi cái có 1 bảng màu cố định làm bản sắc
// riêng (xem comment trong từng file layout).
export type DashboardStyleId =
  | 'analog' | 'cards' | 'racing' | 'minimal' | 'retro' | 'night' | 'family' | 'fleet';

export interface DashboardStyleDef {
  id: DashboardStyleId;
  nameKey: TranslationKey;
  descKey: TranslationKey;
  isPremiumOnly: boolean;
  // Màu đại diện cho style (icon/badge trong danh sách xe) - không phải màu
  // duy nhất của style (Premium có nhiều màu hơn 1), chỉ để nhận diện nhanh.
  previewColor: string;
  Layout: React.ComponentType<CockpitLayoutProps>;
  // Rà soát (góp ý user): "Thương hiệu riêng" bán theo hợp đồng B2B riêng cho
  // gara/đội xe (xem comment trong FleetLayout.tsx), KHÔNG phải mua lẻ qua
  // luồng "Nâng cấp Premium" như 5 style Premium còn lại - hiện diện chung
  // danh sách với nút "Nâng cấp Premium" sẽ khiến user cá nhân mở khoá được
  // rồi chỉ thấy 1 khung có sẵn placeholder "LOGO GARA" trống, trông như lỗi.
  // true = ẩn khỏi picker chọn style trong app (chỉ bật được qua kênh B2B
  // riêng sau này, hiện CHƯA có luồng đó).
  hiddenFromPicker?: boolean;
}

export const DASHBOARD_STYLES: DashboardStyleDef[] = [
  { id: 'analog', nameKey: 'obd.dashboard_style_analog_name', descKey: 'obd.dashboard_style_analog_desc', isPremiumOnly: false, previewColor: '#FF8A3D', Layout: AnalogLayout },
  { id: 'cards', nameKey: 'obd.dashboard_style_cards_name', descKey: 'obd.dashboard_style_cards_desc', isPremiumOnly: false, previewColor: '#34D5C4', Layout: CardsLayout },
  { id: 'racing', nameKey: 'obd.dashboard_style_racing_name', descKey: 'obd.dashboard_style_racing_desc', isPremiumOnly: true, previewColor: '#FB4B4B', Layout: RacingLayout },
  { id: 'minimal', nameKey: 'obd.dashboard_style_minimal_name', descKey: 'obd.dashboard_style_minimal_desc', isPremiumOnly: true, previewColor: '#111111', Layout: MinimalLayout },
  { id: 'retro', nameKey: 'obd.dashboard_style_retro_name', descKey: 'obd.dashboard_style_retro_desc', isPremiumOnly: true, previewColor: '#B08D4F', Layout: RetroLayout },
  { id: 'night', nameKey: 'obd.dashboard_style_night_name', descKey: 'obd.dashboard_style_night_desc', isPremiumOnly: true, previewColor: '#FF3B30', Layout: NightLayout },
  { id: 'family', nameKey: 'obd.dashboard_style_family_name', descKey: 'obd.dashboard_style_family_desc', isPremiumOnly: true, previewColor: '#1D4ED8', Layout: FamilyLayout },
  { id: 'fleet', nameKey: 'obd.dashboard_style_fleet_name', descKey: 'obd.dashboard_style_fleet_desc', isPremiumOnly: true, previewColor: '#9CA3AF', Layout: FleetLayout, hiddenFromPicker: true },
];

export function pickDashboardStyle(id?: string | null): DashboardStyleDef {
  return DASHBOARD_STYLES.find((s) => s.id === id) ?? DASHBOARD_STYLES[0];
}

// Style ẨN (Fleet) không có luồng B2B thật để tự chọn/thanh toán - coi như
// "chưa mở khoá" bất kể is_premium, y hệt cách xử lý style Premium chưa mua.
// Không lọc thẳng trong `pickDashboardStyle` (vẫn cần trả đúng Layout nếu 1
// ngày có luồng B2B ghi thẳng styleId vào storage) - chỉ chặn ở nơi QUYẾT
// ĐỊNH style hiệu lực (GaugeCluster, VehicleDetailScreen).
export function isStyleUsable(style: DashboardStyleDef, isPremium: boolean): boolean {
  if (style.hiddenFromPicker) return false;
  return !style.isPremiumOnly || isPremium;
}

// Lưu theo TỪNG XE (vehicleId) - giữ đúng cơ chế đã có ở gaugeThemes.ts (1
// user có thể có nhiều xe, mỗi xe muốn 1 style khác nhau).
function styleKey(vehicleId: number): string {
  return `obd_dashboard_style_id_${vehicleId}`;
}

export async function getSelectedDashboardStyleId(vehicleId: number): Promise<string> {
  return (await AsyncStorage.getItem(styleKey(vehicleId)).catch(() => null)) ?? DASHBOARD_STYLES[0].id;
}

export async function setSelectedDashboardStyleId(vehicleId: number, id: string): Promise<void> {
  await AsyncStorage.setItem(styleKey(vehicleId), id).catch(() => {});
}
