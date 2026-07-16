import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard';

// enabled mặc định true: vehicleId=undefined vẫn là 1 chế độ HỢP LỆ (dashboard
// tổng hợp mọi xe). Nơi nào chỉ dùng dashboard của 1 xe cụ thể (HomeScreen) tự
// truyền enabled:!!vehicleId để không bắn 1 round-trip "mọi xe" thừa rồi vứt
// ngay khi vehicleId thật về tới (sửa 15/7).
export const useDashboard = (vehicleId?: number, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['dashboard', vehicleId],
    queryFn: () => dashboardApi.get(vehicleId).then(r => r.data),
    enabled: options?.enabled ?? true,
  });
