import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { useThemeStore } from './src/utils/theme';
import { useI18nStore } from './src/i18n';

const queryClient = new QueryClient();

function AppLoader({ children }: { children: React.ReactNode }) {
  const loadTheme = useThemeStore(s => s.loadSaved);
  const loadLang = useI18nStore(s => s.loadSaved);
  useEffect(() => {
    loadTheme();
    loadLang();
  }, []);
  return <>{children}</>;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppLoader>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </AppLoader>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
