import client from './client';

export const dashboardApi = {
  get: (vehicleId?: number) =>
    client.get('/dashboard', { params: { vehicle_id: vehicleId } }),
};
