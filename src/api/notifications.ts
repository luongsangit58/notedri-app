import client from './client';

export const notificationsApi = {
  list: (page = 1) => client.get('/notifications', { params: { page } }),
  markRead: (id: number) => client.post(`/notifications/${id}/read`),
  markAllRead: () => client.post('/notifications/read-all'),
};
