import { useInfiniteQuery } from '@tanstack/react-query';
import { timelineApi, TimelineType } from '../api/timeline';

export const useTimeline = (vehicleId?: number, type?: TimelineType) =>
  useInfiniteQuery({
    queryKey: ['timeline', vehicleId, type ?? 'all'],
    queryFn: ({ pageParam = 1 }) => timelineApi.list(vehicleId, pageParam as number, type).then(r => r.data),
    getNextPageParam: (lastPage: any) => {
      const { current_page, last_page } = lastPage.meta ?? lastPage;
      return current_page < last_page ? current_page + 1 : undefined;
    },
    initialPageParam: 1,
  });
