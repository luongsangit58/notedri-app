import React, { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import LoadingView from '../components/LoadingView';

export default function RootNavigator() {
  const { token, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  if (isLoading) return <LoadingView />;
  return token ? <AppNavigator /> : <AuthNavigator />;
}
