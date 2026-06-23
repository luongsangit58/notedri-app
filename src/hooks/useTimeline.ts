import { useInfiniteQuery } from '@tanstack/react-query';
import { timelineApi } from '../api/timeline';

export const useTimeline = (vehicleId?: number) =>
  useInfiniteQuery({
    queryKey: ['timeline', vehicleId],
    queryFn: ({ pageParam = 1 }) => timelineApi.list(vehicleId, pageParam as number).then(r => r.data),
    getNextPageParam: (lastPage: any) => {
      const { current_page, last_page } = lastPage.meta ?? lastPage;
      return current_page < last_page ? current_page + 1 : undefined;
    },
    initialPageParam: 1,
  });
