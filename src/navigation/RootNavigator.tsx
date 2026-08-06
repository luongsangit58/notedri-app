import React, { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import LoadingView from '../components/LoadingView';
import { startNetworkStatusListener } from '../services/network/networkStatusListener';

export default function RootNavigator() {
  const { token, isLoading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
    startNetworkStatusListener();
  }, []);

  if (isLoading) return <LoadingView />;
  return token ? <AppNavigator /> : <AuthNavigator />;
}
