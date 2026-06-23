import client from './client';

export const authApi = {
  login: (email: string, password: string) =>
    client.post('/auth/login', { email, password }),
  googleMobile: (idToken: string) =>
    client.post('/auth/google', { id_token: idToken }),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
  pushToken: (token: string) =>
    client.post('/auth/push-token', { expo_push_token: token }),
};
