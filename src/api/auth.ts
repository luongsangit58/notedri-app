import client from './client';

export const authApi = {
  login: (email: string, password: string) =>
    client.post('/auth/login', { email, password }),
  googleMobile: (idToken: string) =>
    client.post('/auth/google', { id_token: idToken }),
  logout: () => client.post('/auth/logout'),
  me: (bearerToken?: string) =>
    bearerToken
      ? client.get('/auth/me', { headers: { Authorization: `Bearer ${bearerToken}` } })
      : client.get('/auth/me'),
  pushToken: (token: string) =>
    client.post('/auth/push-token', { expo_push_token: token }),
  register: (name: string, email: string, password: string, password_confirmation: string) =>
    client.post('/auth/register', { name, email, password, password_confirmation }),
  forgotPassword: (email: string) =>
    client.post('/auth/forgot-password', { email }),
};
