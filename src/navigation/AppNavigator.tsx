import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text } from 'react-native';
import { colors } from '../utils/colors';

import DashboardScreen from '../screens/dashboard/DashboardScreen';
import TimelineScreen from '../screens/timeline/TimelineScreen';
import ServicesScreen from '../screens/services/ServicesScreen';
import AddServiceScreen from '../screens/services/AddServiceScreen';
import VehiclesScreen from '../screens/vehicles/VehiclesScreen';
import VehicleDetailScreen from '../screens/vehicles/VehicleDetailScreen';
import AddVehicleScreen from '../screens/vehicles/AddVehicleScreen';
import EditVehicleScreen from '../screens/vehicles/EditVehicleScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AddRefuelScreen from '../screens/refuels/AddRefuelScreen';
import AddOdometerScreen from '../screens/odometer/AddOdometerScreen';
import EditOdometerScreen from '../screens/odometer/EditOdometerScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ReportsScreen from '../screens/reports/ReportsScreen';
import RemindersScreen from '../screens/reminders/RemindersScreen';
import AddReminderScreen from '../screens/reminders/AddReminderScreen';
import EditRefuelScreen from '../screens/refuels/EditRefuelScreen';
import NearbyStationsScreen from '../screens/refuels/NearbyStationsScreen';
import EditServiceScreen from '../screens/services/EditServiceScreen';
import EditReminderScreen from '../screens/reminders/EditReminderScreen';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

const headerOpts = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
};

function VehiclesStack() {
  const Stack = createStackNavigator();
  return (
    <Stack.Navigator screenOptions={headerOpts}>
      <Stack.Screen name="VehiclesList" component={VehiclesScreen} options={{ title: 'Xe của tôi' }} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={({ route }: any) => ({ title: route.params?.vehicleName ?? 'Chi tiết xe' })} />
      <Stack.Screen name="Reminders" component={RemindersScreen} options={{ title: 'Lời nhắc' }} />
    </Stack.Navigator>
  );
}

function ServicesStack() {
  const Stack = createStackNavigator();
  return (
    <Stack.Navigator screenOptions={headerOpts}>
      <Stack.Screen name="ServicesList" component={ServicesScreen} options={{ title: 'Bảo dưỡng' }} />
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
        name="Services"
        component={ServicesStack}
        options={{ title: 'Bảo dưỡng', headerShown: false, tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔧</Text> }}
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

      {/* Refuel & ODO */}
      <RootStack.Screen name="AddRefuel" component={AddRefuelScreen}
        options={{ headerShown: true, ...headerOpts, title: '⛽ Đổ xăng' }} />
      <RootStack.Screen name="AddOdometer" component={AddOdometerScreen}
        options={{ headerShown: true, ...headerOpts, title: '📍 Cập nhật ODO' }} />
      <RootStack.Screen name="EditOdometer" component={EditOdometerScreen}
        options={{ headerShown: false }} />

      {/* Services */}
      <RootStack.Screen name="AddService" component={AddServiceScreen}
        options={{ headerShown: true, ...headerOpts, title: '🔧 Bảo dưỡng mới' }} />

      {/* Vehicles */}
      <RootStack.Screen name="AddVehicle" component={AddVehicleScreen}
        options={{ headerShown: true, ...headerOpts, title: '🚗 Thêm xe' }} />
      <RootStack.Screen name="EditVehicle" component={EditVehicleScreen}
        options={{ headerShown: true, ...headerOpts, title: 'Sửa xe' }} />

      {/* Profile */}
      <RootStack.Screen name="EditProfile" component={EditProfileScreen}
        options={{ headerShown: true, ...headerOpts, title: 'Chỉnh sửa hồ sơ' }} />

      {/* Reminders */}
      <RootStack.Screen name="AddReminder" component={AddReminderScreen}
        options={{ headerShown: false }} />
      <RootStack.Screen name="EditReminder" component={EditReminderScreen}
        options={{ headerShown: false }} />

      {/* Nearby Stations */}
      <RootStack.Screen name="NearbyStations" component={NearbyStationsScreen}
        options={{ headerShown: true, ...headerOpts, title: '⛽ Gần đây' }} />

      {/* Edit */}
      <RootStack.Screen name="EditRefuel" component={EditRefuelScreen}
        options={{ headerShown: true, ...headerOpts, title: '✏️ Sửa lần đổ xăng' }} />
      <RootStack.Screen name="EditService" component={EditServiceScreen}
        options={{ headerShown: true, ...headerOpts, title: '✏️ Sửa bảo dưỡng' }} />

      {/* Notifications & Reports */}
      <RootStack.Screen name="Notifications" component={NotificationsScreen}
        options={{ headerShown: true, ...headerOpts, title: '🔔 Thông báo' }} />
      <RootStack.Screen name="Reports" component={ReportsScreen}
        options={{ headerShown: true, ...headerOpts, title: '📊 Báo cáo' }} />
    </RootStack.Navigator>
  );
}
