import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { vehiclesApi, VehiclePhoto } from '../api/vehicles';

// Rà soát 6/8 (user báo: mở app lúc mất mạng, hoặc cache RAM của react-query
// đã hết hạn (gcTime 5 phút, xem queryClient.ts) - Home không còn gì để hiện
// ngoài thẻ "Không tải được danh sách xe", dù user đã có xe từ trước). Cache
// RAM của react-query KHÔNG sống sót qua lần mở app mới/gcTime hết hạn - lưu
// riêng kết quả THÀNH CÔNG gần nhất xuống đĩa (AsyncStorage) làm phương án dự
// phòng, tách biệt hẳn vòng đời cache RAM. HomeScreen đọc lại key này để vẫn
// hiện được xe đã biết khi fetch thật sự lỗi (xem HomeScreen.tsx).
export const VEHICLES_OFFLINE_CACHE_KEY = 'notedri_vehicles_offline_cache_v1';

// options.enabled (mặc định true, KHÔNG đổi hành vi mọi nơi gọi useVehicles() cũ):
// cho phép gate query theo token khi hook được dùng ở nơi mount TRƯỚC đăng nhập
// (vd icon nổi Nori ở App.tsx root) - tránh bắn request /vehicles chưa có auth.
export const useVehicles = (options?: { enabled?: boolean }) => {
  const query = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehiclesApi.list().then(r => r.data),
    enabled: options?.enabled ?? true,
  });

  useEffect(() => {
    if (query.data === undefined) return;
    AsyncStorage.setItem(VEHICLES_OFFLINE_CACHE_KEY, JSON.stringify(query.data)).catch(() => {});
  }, [query.data]);

  return query;
};

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
