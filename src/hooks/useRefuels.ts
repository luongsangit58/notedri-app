import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { refuelsApi } from '../api/refuels';

export const useRefuels = (vehicleId?: number, page = 1) =>
  useQuery({
    queryKey: ['refuels', vehicleId, page],
    queryFn: () => refuelsApi.list(vehicleId, page).then(r => r.data),
  });

export const useCreateRefuel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => refuelsApi.create(data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refuels'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useDeleteRefuel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => refuelsApi.delete(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['refuels'] }),
  });
};
