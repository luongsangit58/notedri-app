import { useQuery } from '@tanstack/react-query';
import { fuelTypesApi } from '../api/fuelTypes';

export const useFuelTypes = () =>
  useQuery({
    queryKey: ['fuel-types'],
    queryFn: () => fuelTypesApi.list().then(r => r.data?.data ?? r.data),
    staleTime: 1000 * 60 * 60, // 1 hour — fuel types don't change often
  });
