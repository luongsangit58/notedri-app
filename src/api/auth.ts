import { Platform } from 'react-native';
import Constants from 'expo-constants';
import client from './client';
import { getDeviceId } from '../utils/deviceId';

export async function deviceMeta(): Promise<{ device_id: string; device_name: string; platform: string }> {
  const device_id = await getDeviceId();
  const rawName = (Constants as any).deviceName;
  const device_name: string = (typeof rawName === 'string' && rawName) ? rawName : (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  return { device_id, device_name, platform: Platform.OS };
}

export const authApi = {
  login: async (email: string, password: string) => {
    const meta = await deviceMeta();
    return client.post('/auth/login', { email, password, ...meta });
  },
  logout: () => client.post('/auth/logout'),
  unlinkGoogle: () => client.post('/auth/google/unlink'),
  me: (bearerToken?: string) =>
    bearerToken
      ? client.get('/auth/me', { headers: { Authorization: `Bearer ${bearerToken}` } })
      : client.get('/auth/me'),
  pushToken: async (token: string) => {
    const { device_id } = await deviceMeta();
    return client.post('/auth/push-token', { expo_push_token: token, device_id });
  },
  register: (name: string, email: string, password: string, password_confirmation: string) =>
    client.post('/auth/register', { name, email, password, password_confirmation }),
  verifyOtp: async (email: string, code: string) => {
    const meta = await deviceMeta();
    return client.post('/auth/register/verify-otp', { email, code, ...meta });
  },
  forgotPassword: (email: string) =>
    client.post('/auth/forgot-password', { email }),
};
