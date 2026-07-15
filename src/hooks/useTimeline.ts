import { useInfiniteQuery } from '@tanstack/react-query';
import { timelineApi, TimelineType } from '../api/timeline';

// enabled:!!vehicleId - TimelineScreen chỉ set vehicleId THẬT sau khi useVehicles()
// load xong (không có chế độ "mọi xe" cố ý ở đây), thiếu enabled khiến query bắn
// ngay với vehicleId=undefined rồi bắn lại khi ID thật về (sửa 15/7, cùng lỗi Home).
export const useTimeline = (vehicleId?: number, type?: TimelineType) =>
  useInfiniteQuery({
    queryKey: ['timeline', vehicleId, type ?? 'all'],
    queryFn: ({ pageParam = 1 }) => timelineApi.list(vehicleId, pageParam as number, type).then(r => r.data),
    getNextPageParam: (lastPage: any) => {
      const { current_page, last_page } = lastPage.meta ?? lastPage;
      return current_page < last_page ? current_page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: !!vehicleId,
  });
