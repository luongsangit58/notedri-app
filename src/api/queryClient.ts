import { QueryClient } from '@tanstack/react-query';

// axios timeout (client.ts: 30s) báo lỗi qua code ECONNABORTED, không phải status
// HTTP - retry sau 1 lần TIMEOUT gần như chắc chắn timeout lại lần nữa (mạng đã
// yếu sẵn trong 30s đó, không phải 1 lần trục trặc thoáng qua), chỉ CỘNG DỒN
// thêm 30s chờ vô ích. Sửa 15/7 (rà soát Home load lâu): chỉ retry lỗi tạm thời
// thật sự (mất kết nối rồi có lại, lỗi 5xx thoáng qua...), bỏ qua timeout.
function isTimeoutError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  return err?.code === 'ECONNABORTED' || (err?.message?.toLowerCase().includes('timeout') ?? false);
}

// QueryClient singleton dùng chung (App.tsx + authStore) để có thể xoá cache khi đổi tài khoản.
// Mặc định caching hợp lý -> KHÔNG refetch (quay spinner) mỗi lần vào lại màn.
// Dữ liệu "tươi" trong 60s; giữ cache 5 phút; không refetch khi quay lại app.
// Mutation vẫn invalidate để cập nhật; pull-to-refresh vẫn ép tải mới.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => failureCount < 1 && !isTimeoutError(error),
    },
  },
});
