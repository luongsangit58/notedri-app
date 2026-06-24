import client from './client';

export const refuelsApi = {
  list: (vehicleId?: number, page = 1) =>
    client.get('/refuels', { params: { vehicle_id: vehicleId, page } }),
  get: (id: number) => client.get(`/refuels/${id}`),
  create: (data: any) => client.post('/refuels', data),
  update: (id: number, data: any) => client.put(`/refuels/${id}`, data),
  delete: (id: number) => client.delete(`/refuels/${id}`),
  nearbyStations: (lat: number, lng: number) =>
    client.get('/refuels/nearby-stations', { params: { lat, lon: lng } }),
  fuelPrice: (type: string) =>
    client.get('/refuels/fuel-price', { params: { type } }),
};
