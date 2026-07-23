import { useThemeStore } from '../utils/theme';

// Bảng màu "mặt kính đồng hồ" cho 2 style MIỄN PHÍ (Analog, Lưới thẻ số) -
// theo đúng biến --d* trong bản thiết kế artifact, có bản sáng vì 2 style này
// đi theo theme sáng/tối của app. 5/6 style Premium cũng có bản sáng+tối
// riêng (xem `usePremiumPalette` bên dưới) - chỉ "Ban đêm" cố định 1 hướng.
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

// Rà soát (góp ý user: 6 style Premium chỉ có 1 bảng màu cố định, cần bản
// sáng+tối riêng) - helper DÙNG CHUNG cho mỗi layout Premium thay vì lặp lại
// `useThemeStore` + ternary ở từng file. Style "Ban đêm" CỐ TÌNH không dùng
// helper này (xem comment trong NightLayout.tsx) - bản sắc của nó LÀ luôn tối,
// không có khái niệm "bản sáng", khác 5 style Premium còn lại vốn chỉ đang
// thiếu bản kia (chưa từng có ý định cố định 1 hướng sáng/tối).
export function usePremiumPalette<T>(dark: T, light: T): T {
  const mode = useThemeStore((s) => s.mode);
  return mode === 'light' ? light : dark;
}
