import client from './client';

export const profileApi = {
  update: (data: { name: string; phone?: string; tinh?: string; phuong_xa?: string; dia_chi?: string }) =>
    client.put('/profile', data),
  updatePassword: (data: { current_password: string; password: string; password_confirmation: string }) =>
    client.put('/profile/password', data),
  deleteAccount: (password: string) =>
    client.delete('/profile', { data: { password } }),
};
