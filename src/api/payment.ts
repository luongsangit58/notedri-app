import client from './client';

export const paymentApi = {
  orders: () => client.get('/payment/orders'),
  cancel: (id: number) => client.delete(`/payment/orders/${id}`),
};
