import client from './client';

export const notificationsApi = {
  list: (page = 1) => client.get('/notifications', { params: { page } }),
  markRead: (key: string) => client.post('/notifications/read', { key }),
  markAllRead: () => client.post('/notifications/read-all'),
};
