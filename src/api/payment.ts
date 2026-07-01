import client from './client';

export const paymentApi = {
  orders: () => client.get('/payment/orders'),
  order: (id: number) => client.get(`/payment/orders/${id}`),
  cancel: (id: number) => client.delete(`/payment/orders/${id}`),
  status: (id: number) => client.get(`/payment/orders/${id}/status`),
};
