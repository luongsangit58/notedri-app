import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications';

export const useNotifications = (page = 1) =>
  useQuery({
    queryKey: ['notifications', page],
    queryFn: () => notificationsApi.list(page).then(r => r.data),
  });

export const useMarkAllRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead().then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
};
