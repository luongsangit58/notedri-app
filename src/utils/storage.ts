import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

export const storage = {
  getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
  setToken: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  deleteToken: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  getUser: () => SecureStore.getItemAsync(USER_KEY),
  setUser: (user: string) => SecureStore.setItemAsync(USER_KEY, user),
  deleteUser: () => SecureStore.deleteItemAsync(USER_KEY),
};
