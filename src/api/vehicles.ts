import client from './client';

export type VehiclePhoto = { uri: string; type: string; name: string };

function appendFormData(form: FormData, data: any) {
  Object.entries(data).forEach(([k, v]) => {
    if (v != null) form.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  });
}

export const vehiclesApi = {
  list: () => client.get('/vehicles'),
  get: (id: number) => client.get(`/vehicles/${id}`),
  create: (data: any, photo?: VehiclePhoto) => {
    if (!photo) return client.post('/vehicles', data);
    const form = new FormData();
    appendFormData(form, data);
    form.append('anh', { uri: photo.uri, type: photo.type ?? 'image/jpeg', name: photo.name ?? 'vehicle.jpg' } as any);
    return client.post('/vehicles', form);
  },
  update: (id: number, data: any, photo?: VehiclePhoto) => {
    if (!photo && !data.anh_xoa) return client.put(`/vehicles/${id}`, data);
    const form = new FormData();
    form.append('_method', 'PUT');
    appendFormData(form, data);
    if (photo) form.append('anh', { uri: photo.uri, type: photo.type ?? 'image/jpeg', name: photo.name ?? 'vehicle.jpg' } as any);
    return client.post(`/vehicles/${id}`, form);
  },
  delete: (id: number) => client.delete(`/vehicles/${id}`),
  health: (id: number) => client.get(`/vehicles/${id}/health`),
  reminders: (id: number) => client.get(`/vehicles/${id}/reminders`),
  setDefault: (id: number) => client.post(`/vehicles/${id}/default`),
  toggleRest: (id: number) => client.post(`/vehicles/${id}/rest`),
};
