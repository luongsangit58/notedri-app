import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi, VehiclePhoto } from '../api/vehicles';

// options.enabled (mặc định true, KHÔNG đổi hành vi mọi nơi gọi useVehicles() cũ):
// cho phép gate query theo token khi hook được dùng ở nơi mount TRƯỚC đăng nhập
// (vd icon nổi Nori ở App.tsx root) - tránh bắn request /vehicles chưa có auth.
export const useVehicles = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list().then(r => r.data),
    enabled: options?.enabled ?? true,
  });

export const useVehicle = (id: number) =>
  useQuery({ queryKey: ['vehicles', id], queryFn: () => vehiclesApi.get(id).then(r => r.data), enabled: !!id });

export const useVehicleHealth = (id: number) =>
  useQuery({ queryKey: ['vehicles', id, 'health'], queryFn: () => vehiclesApi.health(id).then(r => r.data), enabled: !!id });

export const useVehicleReminders = (id: number) =>
  useQuery({ queryKey: ['vehicles', id, 'reminders'], queryFn: () => vehiclesApi.reminders(id).then(r => r.data), enabled: !!id });

export const useCreateVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, photo }: { data: any; photo?: VehiclePhoto }) =>
      vehiclesApi.create(data, photo).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useUpdateVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, photo }: { id: number; data: any; photo?: VehiclePhoto }) =>
      vehiclesApi.update(id, data, photo).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useDeleteVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => vehiclesApi.delete(id).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['timeline'] });
    },
  });
};

export const useSetDefaultVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => vehiclesApi.setDefault(id).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useToggleVehicleRest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => vehiclesApi.toggleRest(id).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
