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

// Rà soát 21/8 (5): bỏ hẳn login/register/verifyOtp/forgotPassword (email+password) - CHỈ còn
// Apple/Google (xem comment AuthController.php phía backend + LoginScreen.tsx).
export const authApi = {
  logout: () => client.post('/auth/logout'),
  loginWithGoogle: async (idToken: string) => {
    const meta = await deviceMeta();
    return client.post('/auth/google', { id_token: idToken, ...meta });
  },
  linkGoogle: (idToken: string) => client.post('/auth/google/link', { id_token: idToken }),
  unlinkGoogle: () => client.post('/auth/google/unlink'),
  loginWithApple: async (identityToken: string, fullName?: string) => {
    const meta = await deviceMeta();
    return client.post('/auth/apple', { identity_token: identityToken, full_name: fullName, ...meta });
  },
  linkApple: (identityToken: string) => client.post('/auth/apple/link', { identity_token: identityToken }),
  unlinkApple: () => client.post('/auth/apple/unlink'),
  me: (bearerToken?: string) =>
    bearerToken
      ? client.get('/auth/me', { headers: { Authorization: `Bearer ${bearerToken}` } })
      : client.get('/auth/me'),
  pushToken: async (token: string) => {
    const { device_id } = await deviceMeta();
    return client.post('/auth/push-token', { expo_push_token: token, device_id });
  },
};
