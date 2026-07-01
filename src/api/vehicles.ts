import client from './client';

export type VehiclePhoto = { uri: string; type: string; name: string };

export const vehiclesApi = {
  list: () => client.get('/vehicles'),
  get: (id: number) => client.get(`/vehicles/${id}`),
  create: (data: any, photo?: VehiclePhoto) => {
    if (!photo) return client.post('/vehicles', data);
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v != null) form.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    });
    form.append('anh', { uri: photo.uri, type: photo.type, name: photo.name } as any);
    return client.post('/vehicles', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  update: (id: number, data: any, photo?: VehiclePhoto) => {
    if (!photo && !data.anh_xoa) return client.put(`/vehicles/${id}`, data);
    const form = new FormData();
    form.append('_method', 'PUT');
    Object.entries(data).forEach(([k, v]) => {
      if (v != null) form.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    });
    if (photo) form.append('anh', { uri: photo.uri, type: photo.type, name: photo.name } as any);
    return client.post(`/vehicles/${id}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  delete: (id: number) => client.delete(`/vehicles/${id}`),
  health: (id: number) => client.get(`/vehicles/${id}/health`),
  reminders: (id: number) => client.get(`/vehicles/${id}/reminders`),
  setDefault: (id: number) => client.post(`/vehicles/${id}/default`),
  toggleRest: (id: number) => client.post(`/vehicles/${id}/rest`),
};
