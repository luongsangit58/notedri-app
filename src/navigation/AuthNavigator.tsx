import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import OnboardingScreen, { ONBOARDING_SEEN_KEY } from '../screens/auth/OnboardingScreen';
import LoadingView from '../components/LoadingView';

const Stack = createStackNavigator();

export default function AuthNavigator() {
  // Chỉ hiện onboarding cho lần mở app đầu tiên (chưa xem).
  const [seen, setSeen] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then((v) => setSeen(v === '1'))
      .catch(() => setSeen(true)); // lỗi đọc -> bỏ qua onboarding, vào thẳng Login
  }, []);

  if (seen === null) return <LoadingView />;

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={seen ? 'Login' : 'Onboarding'}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
}
