import client from './client';

export const profileApi = {
  update: (data: { name: string; email?: string }) =>
    client.put('/profile', data),
  updatePassword: (data: { current_password: string; password: string; password_confirmation: string }) =>
    client.put('/profile/password', data),
  deleteAccount: (password: string) =>
    client.delete('/profile', { data: { password } }),
};
