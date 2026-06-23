import client from './client';

export const odometerApi = {
  list: (vehicleId: number, page = 1) =>
    client.get(`/vehicles/${vehicleId}/odometer`, { params: { page } }),
  create: (vehicleId: number, data: any) =>
    client.post(`/vehicles/${vehicleId}/odometer`, data),
  update: (vehicleId: number, id: number, data: any) =>
    client.put(`/vehicles/${vehicleId}/odometer/${id}`, data),
  delete: (vehicleId: number, id: number) =>
    client.delete(`/vehicles/${vehicleId}/odometer/${id}`),
};
