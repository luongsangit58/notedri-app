import { create } from 'zustand';
import { authApi } from '../api/auth';
import { storage } from '../utils/storage';

interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true });
      const token = await storage.getToken();
      const userStr = await storage.getUser();
      if (token && userStr) {
        const user = JSON.parse(userStr);
        set({ token, user, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authApi.login(email, password);
      const { token, user } = response.data;
      await storage.setToken(token);
      await storage.setUser(JSON.stringify(user));
      set({ token, user, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.message ?? 'Đăng nhập thất bại';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  loginWithGoogle: async (idToken: string) => {
    try {
      set({ isLoading: true, error: null });
      const response = await authApi.googleMobile(idToken);
      const { token, user } = response.data;
      await storage.setToken(token);
      await storage.setUser(JSON.stringify(user));
      set({ token, user, isLoading: false });
    } catch (error: any) {
      const message = error.response?.data?.message ?? 'Đăng nhập Google thất bại';
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    try {
      const { token } = get();
      if (token) {
        await authApi.logout().catch(() => {});
      }
    } finally {
      await storage.deleteToken();
      await storage.deleteUser();
      set({ user: null, token: null });
    }
  },

  setUser: (user: User) => set({ user }),
  clearError: () => set({ error: null }),
}));
