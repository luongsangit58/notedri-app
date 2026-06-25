import client from './client';

export const servicesApi = {
  list: (vehicleId?: number, page = 1) =>
    client.get('/services', { params: { vehicle: vehicleId, page } }),
  get: (id: number) => client.get(`/services/${id}`),
  create: (data: any) => client.post('/services', data),
  update: (id: number, data: any) => client.put(`/services/${id}`, data),
  delete: (id: number) => client.delete(`/services/${id}`),
  guide: (vehicleId?: number) =>
    client.get('/services/guide', { params: vehicleId ? { vehicle: vehicleId } : undefined }),
};
