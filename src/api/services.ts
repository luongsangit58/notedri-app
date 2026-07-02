import client from './client';

export type ServicePhoto = { uri: string; type: string; name: string };

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

function appendData(form: FormData, data: any) {
  Object.entries(data).forEach(([k, v]) => {
    if (v != null) form.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  });
}

export const servicesApi = {
  list: (vehicleId?: number, page = 1) =>
    client.get('/services', { params: { vehicle: vehicleId, page } }),
  get: (id: number) => client.get(`/services/${id}`),
  create: (data: any, photo?: ServicePhoto) => {
    if (!photo) return client.post('/services', data);
    const form = new FormData();
    appendData(form, data);
    form.append('dinh_kem', { uri: photo.uri, type: photo.type, name: photo.name } as any);
    return client.post('/services', form, MULTIPART);
  },
  update: (id: number, data: any, photo?: ServicePhoto, removePhoto?: boolean) => {
    if (!photo && !removePhoto) return client.put(`/services/${id}`, data);
    const form = new FormData();
    form.append('_method', 'PUT'); // method spoofing: multipart PUT không parse file trong PHP
    appendData(form, data);
    if (photo) form.append('dinh_kem', { uri: photo.uri, type: photo.type, name: photo.name } as any);
    if (removePhoto) form.append('dinh_kem_xoa', '1');
    return client.post(`/services/${id}`, form, MULTIPART);
  },
  delete: (id: number) => client.delete(`/services/${id}`),
  guide: (vehicleId?: number) =>
    client.get('/services/guide', { params: vehicleId ? { vehicle: vehicleId } : undefined }),
};
