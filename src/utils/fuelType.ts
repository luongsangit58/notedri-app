// Icon + màu theo loại nhiên liệu - dùng chung cho danh sách xe (VehiclesScreen/
// VehicleCard) và Trang chủ, để 1 loại nhiên liệu luôn hiện cùng 1 icon/màu ở
// mọi nơi (tester báo danh sách xe chưa phân loại rõ theo nhiên liệu).
export interface FuelTypeMeta {
  key: 'xang' | 'dau' | 'dien' | 'hybrid' | 'khac';
  icon: string;
  color: string;
}

const PETROL: FuelTypeMeta = { key: 'xang', icon: 'gas-pump', color: '#f59e0b' };
const DIESEL: FuelTypeMeta = { key: 'dau', icon: 'oil-can', color: '#92400e' };
const ELECTRIC: FuelTypeMeta = { key: 'dien', icon: 'charging-station', color: '#10b981' };
const HYBRID: FuelTypeMeta = { key: 'hybrid', icon: 'leaf', color: '#65a30d' };
const OTHER: FuelTypeMeta = { key: 'khac', icon: 'question-circle', color: '#78716c' };

export function fuelTypeMeta(vehicle: any): FuelTypeMeta {
  const isHybrid: boolean = vehicle?.is_hybrid ?? /hybrid/i.test(String(vehicle?.fuel_type ?? ''));
  if (isHybrid) return HYBRID;
  const isEv: boolean = vehicle?.is_ev ?? /điện|dien|electric|\bev\b/i.test(String(vehicle?.fuel_type ?? ''));
  if (isEv) return ELECTRIC;
  const raw = String(vehicle?.fuel_type ?? '').toLowerCase();
  if (/dầu|diesel|dau\b/.test(raw)) return DIESEL;
  if (/xăng|petrol|gasoline|xang/.test(raw)) return PETROL;
  if (!raw) return PETROL; // mặc định (đa số xe hiện có là xe xăng, tránh hiện "?" khi thiếu dữ liệu)
  return OTHER;
}
