import { useThemeStore } from '../utils/theme';

// Bảng màu "mặt kính đồng hồ" cho 2 style MIỄN PHÍ (Analog, Lưới thẻ số) -
// theo đúng biến --d* trong bản thiết kế artifact, nhưng có thêm bản SÁNG vì
// 2 style này đi theo theme sáng/tối của app (khác 6 style Premium, mỗi cái
// có 1 bảng màu cố định làm bản sắc riêng - xem các layout Premium).
export interface CockpitPalette {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textDim: string;
  accent: string; // tốc độ
  accent2: string; // vòng tua / dữ liệu phụ
  good: string;
  warn: string;
  crit: string;
}

export const cockpitDark: CockpitPalette = {
  bg: '#0A0D13',
  surface: '#121722',
  surface2: '#1A2130',
  border: '#262E40',
  text: '#EDF1F7',
  textDim: '#7C879C',
  accent: '#FF8A3D',
  accent2: '#34D5C4',
  good: '#34D399',
  warn: '#FBBF24',
  crit: '#FB4B4B',
};

export const cockpitLight: CockpitPalette = {
  bg: '#F3F1EC',
  surface: '#FFFFFF',
  surface2: '#EDEAE2',
  border: '#DAD5C9',
  text: '#1C1A16',
  textDim: '#6B6558',
  accent: '#C4571F',
  accent2: '#0F8F82',
  good: '#1B8A5A',
  warn: '#B45309',
  crit: '#DC2626',
};

export function useCockpitPalette(): CockpitPalette {
  const mode = useThemeStore((s) => s.mode);
  return mode === 'light' ? cockpitLight : cockpitDark;
}
