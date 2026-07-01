import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vehiclesApi, VehiclePhoto } from '../api/vehicles';

export const useVehicles = () =>
  useQuery({ queryKey: ['vehicles'], queryFn: () => vehiclesApi.list().then(r => r.data) });

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
};

export const useUpdateVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data, photo }: { id: number; data: any; photo?: VehiclePhoto }) =>
      vehiclesApi.update(id, data, photo).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
};

export const useDeleteVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => vehiclesApi.delete(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
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
