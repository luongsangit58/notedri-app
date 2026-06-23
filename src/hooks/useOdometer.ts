import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { odometerApi } from '../api/odometer';

export const useOdometer = (vehicleId: number, page = 1) =>
  useQuery({
    queryKey: ['odometer', vehicleId, page],
    queryFn: () => odometerApi.list(vehicleId, page).then(r => r.data),
    enabled: !!vehicleId,
  });

export const useCreateOdometer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: number; data: any }) =>
      odometerApi.create(vehicleId, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['odometer', variables.vehicleId] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
