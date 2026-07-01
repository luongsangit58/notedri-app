import client from './client';

export type TimelineType = 'refuel' | 'service';

export const timelineApi = {
  list: (vehicleId?: number, page = 1, type?: TimelineType) =>
    client.get('/timeline', { params: { vehicle: vehicleId, page, type } }),
};
