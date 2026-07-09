import client from './client';

export const profileApi = {
  update: (data: { name: string; phone?: string; tinh?: string; phuong_xa?: string; dia_chi?: string }) =>
    client.put('/profile', data),
  updatePassword: (data: { current_password: string; password: string; password_confirmation: string }) =>
    client.put('/profile/password', data),
  // Lưu ngôn ngữ vào tài khoản để đồng bộ web + email (không chỉ ở máy này).
  setLocale: (locale: 'vi' | 'en') => client.put('/profile/locale', { locale }),
  // Tài khoản có mật khẩu -> xác nhận bằng password; tài khoản Google-only (không mật khẩu)
  // -> xác nhận bằng cách gõ lại email (khớp ProfileController::destroy phía backend).
  deleteAccount: (confirmValue: string, hasPassword: boolean) =>
    client.delete('/profile', { data: hasPassword ? { password: confirmValue } : { confirm_email: confirmValue } }),
};
