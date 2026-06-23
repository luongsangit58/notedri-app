import client from './client';

export const timelineApi = {
  list: (vehicleId?: number, page = 1) =>
    client.get('/timeline', { params: { vehicle_id: vehicleId, page } }),
};
