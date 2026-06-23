import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard';

export const useDashboard = (vehicleId?: number) =>
  useQuery({
    queryKey: ['dashboard', vehicleId],
    queryFn: () => dashboardApi.get(vehicleId).then(r => r.data),
  });
