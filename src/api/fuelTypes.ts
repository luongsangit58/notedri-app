import client from './client';

export const fuelTypesApi = {
  list: () => client.get('/fuel-types'),
};
