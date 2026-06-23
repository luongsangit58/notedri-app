import client from './client';

export const vehiclesApi = {
  list: () => client.get('/vehicles'),
  get: (id: number) => client.get(`/vehicles/${id}`),
  create: (data: any) => client.post('/vehicles', data),
  update: (id: number, data: any) => client.put(`/vehicles/${id}`, data),
  delete: (id: number) => client.delete(`/vehicles/${id}`),
  health: (id: number) => client.get(`/vehicles/${id}/health`),
  reminders: (id: number) => client.get(`/vehicles/${id}/reminders`),
  setDefault: (id: number) => client.post(`/vehicles/${id}/set-default`),
};
