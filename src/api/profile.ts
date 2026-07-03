import client from './client';

export const profileApi = {
  update: (data: { name: string; phone?: string; tinh?: string; phuong_xa?: string; dia_chi?: string }) =>
    client.put('/profile', data),
  updatePassword: (data: { current_password: string; password: string; password_confirmation: string }) =>
    client.put('/profile/password', data),
  // Lưu ngôn ngữ vào tài khoản để đồng bộ web + email (không chỉ ở máy này).
  setLocale: (locale: 'vi' | 'en') => client.put('/profile/locale', { locale }),
  deleteAccount: (password: string) =>
    client.delete('/profile', { data: { password } }),
};
