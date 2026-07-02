import { QueryClient } from '@tanstack/react-query';

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
      retry: 1,
    },
  },
});
