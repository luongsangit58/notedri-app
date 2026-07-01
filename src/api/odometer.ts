import client from './client';

export const odometerApi = {
  list: (vehicleId: number, page = 1) =>
    client.get('/odometer', { params: { vehicle: vehicleId, page } }),
  create: (vehicleId: number, data: any) =>
    client.post(`/vehicles/${vehicleId}/odometer`, data),
  get: (id: number) =>
    client.get(`/odometer/${id}`),
  update: (id: number, data: { ngay: string; odometer: number; ghi_chu?: string | null }) =>
    client.put(`/odometer/${id}`, data),
  delete: (id: number) =>
    client.delete(`/odometer/${id}`),
};
