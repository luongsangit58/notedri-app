import client from './client';

export type GeoItem = { code: string; name: string };

export const geoApi = {
  provinces: () => client.get<{ data: GeoItem[] }>('/geo/provinces'),
  wards: (provinceCode: string) => client.get<{ data: GeoItem[] }>(`/geo/wards/${provinceCode}`),
};
