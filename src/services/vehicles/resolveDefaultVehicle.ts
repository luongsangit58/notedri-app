import { vehiclesApi } from '../../api/vehicles';
import { queryClient } from '../../api/queryClient';

export type VehicleLite = { id: number; ten: string; is_default?: boolean };

function pickDefault(list: VehicleLite[]): VehicleLite | null {
  if (list.length === 0) return null;
  return list.find((v) => v.is_default) ?? list[0];
}

// Xe mặc định (is_default) - cùng quy ước mọi màn hình khác trong app đã dùng
// (Home, AddRefuel, Reminders, GpsTrips...). Ưu tiên cache React Query (Home/
// Dashboard hầu như luôn đã fetch xong lúc app vừa mở) - đỡ 1 round-trip mạng;
// chỉ gọi thẳng API khi cache trống (cold start rất sớm, vd mở app lần đầu).
//
// Dùng chung bởi 2 nơi cần "xe nào là xe chính của tài khoản này": thẻ NFC/App
// Link https://notedri.com/connect (handleConnectLink.ts - thẻ dùng chung, không
// mang vehicleId riêng) và auto-connect nền lúc mở app (ObdAutoConnect.tsx - ưu
// tiên xe mặc định trước khi rơi về heuristic "kết nối gần nhất" khi có >1 xe
// cùng bật auto-connect).
export async function resolveDefaultVehicle(): Promise<VehicleLite | null> {
  const cached: any = queryClient.getQueryData(['vehicles']);
  const cachedList: VehicleLite[] = Array.isArray(cached?.data) ? cached.data : Array.isArray(cached) ? cached : [];
  if (cachedList.length > 0) return pickDefault(cachedList);

  try {
    const res = await vehiclesApi.list();
    const list: VehicleLite[] = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
    return pickDefault(list);
  } catch {
    return null;
  }
}
