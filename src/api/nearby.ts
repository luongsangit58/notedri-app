import client from './client';

// Gara/Trung tâm đăng kiểm gần đây - cùng hợp đồng JSON với backend Api\V1\GarageController/
// DangKiemController (KHÔNG gate Premium, xem docs/api-contracts.md).
export const nearbyApi = {
  garages: (lat: number, lng: number, loai?: string) =>
    client.get('/garages/nearby', { params: { lat, lon: lng, loai } }),
  dangKiem: (lat: number, lng: number) =>
    client.get('/dang-kiem/nearby', { params: { lat, lon: lng } }),
};
