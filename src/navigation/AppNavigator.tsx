import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import { colors } from '../utils/colors';
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TimelineScreen from '../screens/timeline/TimelineScreen';
import VehiclesScreen from '../screens/vehicles/VehiclesScreen';
import VehicleDetailScreen from '../screens/vehicles/VehicleDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AddRefuelScreen from '../screens/refuels/AddRefuelScreen';
import AddOdometerScreen from '../screens/odometer/AddOdometerScreen';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

function VehiclesStack() {
  const Stack = createStackNavigator();
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
      <Stack.Screen name="VehiclesList" component={VehiclesScreen} options={{ title: 'Xe của tôi' }} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={{ title: 'Chi tiết xe' }} />
    </Stack.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}>
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Tổng quan', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text> }}
      />
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{ title: 'Nhật ký', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text> }}
      />
      <Tab.Screen
        name="Vehicles"
        component={VehiclesStack}
        options={{ title: 'Xe', headerShown: false, tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🚗</Text> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Hồ sơ', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={TabNavigator} />
      <RootStack.Screen
        name="AddRefuel"
        component={AddRefuelScreen}
        options={{ headerShown: true, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, title: 'Đổ xăng' }}
      />
      <RootStack.Screen
        name="AddOdometer"
        component={AddOdometerScreen}
        options={{ headerShown: true, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text, title: 'Cập nhật ODO' }}
      />
    </RootStack.Navigator>
  );
}
