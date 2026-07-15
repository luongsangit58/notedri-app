import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi, ServicePhoto } from '../api/services';

// enabled:!!vehicleId - ServicesScreen chỉ set vehicleId THẬT sau khi useVehicles()
// load xong, thiếu enabled khiến query bắn ngay với vehicleId=undefined rồi bắn
// lại khi ID thật về (sửa 15/7, cùng lỗi Home).
export const useServices = (vehicleId?: number) =>
  useInfiniteQuery({
    queryKey: ['services', vehicleId],
    queryFn: ({ pageParam = 1 }) => servicesApi.list(vehicleId, pageParam as number).then(r => r.data),
    getNextPageParam: (lastPage: any) => {
      const { current_page, last_page } = lastPage.meta ?? lastPage;
      return current_page < last_page ? current_page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: !!vehicleId,
  });

export const useCreateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, photo }: { data: any; photo?: ServicePhoto }) =>
      servicesApi.create(data, photo).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useUpdateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, photo, removePhoto }: { id: number; data: any; photo?: ServicePhoto; removePhoto?: boolean }) =>
      servicesApi.update(id, data, photo, removePhoto).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useDeleteService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => servicesApi.delete(id).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};
