import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { refuelsApi } from '../api/refuels';

// enabled:!!vehicleId - RefuelsListScreen chỉ set vehicleId THẬT sau khi useVehicles()
// load xong, thiếu enabled khiến query bắn ngay với vehicleId=undefined rồi bắn
// lại khi ID thật về (sửa 15/7, cùng lỗi Home) - response còn kèm meta.consumption/
// meta.prediction tính toán rồi vứt bỏ ngay lập tức, phí hơn các hook khác.
export const useRefuels = (vehicleId?: number, page = 1) =>
  useQuery({
    queryKey: ['refuels', vehicleId, page],
    queryFn: () => refuelsApi.list(vehicleId, page).then(r => r.data),
    enabled: !!vehicleId,
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

export const useUpdateRefuel = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      refuelsApi.update(id, data).then(r => r.data),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refuels'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};
