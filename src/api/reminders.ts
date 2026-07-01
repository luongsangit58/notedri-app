import client from './client';

export const remindersApi = {
  list: (vehicleId: number) =>
    client.get(`/vehicles/${vehicleId}/reminders`),
  create: (vehicleId: number, data: any) =>
    client.post(`/vehicles/${vehicleId}/reminders`, data),
  update: (id: number, data: any) =>
    client.put(`/reminders/${id}`, data),
  delete: (id: number) =>
    client.delete(`/reminders/${id}`),
  done: (id: number, data?: { last_done_odo?: number; last_done_date?: string }) =>
    client.post(`/reminders/${id}/done`, data ?? {}),
  seedDefaults: (vehicleId: number) =>
    client.post(`/vehicles/${vehicleId}/reminders/seed`),
  confirmAll: (vehicleId: number) =>
    client.post(`/vehicles/${vehicleId}/reminders/confirm-all`),
};
