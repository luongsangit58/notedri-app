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

export const useUpdateOdometer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { ngay: string; odometer: number; ghi_chu?: string | null } }) =>
      odometerApi.update(id, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['odometer'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useDeleteOdometer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => odometerApi.delete(id).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['odometer'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};
