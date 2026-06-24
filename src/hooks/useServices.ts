import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi } from '../api/services';

export const useServices = (vehicleId?: number) =>
  useInfiniteQuery({
    queryKey: ['services', vehicleId],
    queryFn: ({ pageParam = 1 }) => servicesApi.list(vehicleId, pageParam as number).then(r => r.data),
    getNextPageParam: (lastPage: any) => {
      const { current_page, last_page } = lastPage.meta ?? lastPage;
      return current_page < last_page ? current_page + 1 : undefined;
    },
    initialPageParam: 1,
  });

export const useCreateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => servicesApi.create(data).then(r => r.data),
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
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      servicesApi.update(id, data).then(r => r.data),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
};
