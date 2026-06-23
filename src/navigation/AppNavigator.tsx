import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { colors } from '../utils/colors';
import { FontAwesome5 } from '@expo/vector-icons';

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
import RefuelsListScreen from '../screens/refuels/RefuelsListScreen';
import OdometerListScreen from '../screens/odometer/OdometerListScreen';
import EditServiceScreen from '../screens/services/EditServiceScreen';
import EditReminderScreen from '../screens/reminders/EditReminderScreen';
import DossierScreen from '../screens/vehicles/DossierScreen';
import HealthScreen from '../screens/health/HealthScreen';

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
        options={{ title: 'Tổng quan', tabBarIcon: ({ color, size }) => <FontAwesome5 name="home" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{ title: 'Nhật ký', tabBarIcon: ({ color, size }) => <FontAwesome5 name="history" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesStack}
        options={{ title: 'Bảo dưỡng', headerShown: false, tabBarIcon: ({ color, size }) => <FontAwesome5 name="wrench" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Vehicles"
        component={VehiclesStack}
        options={{ title: 'Xe', headerShown: false, tabBarIcon: ({ color, size }) => <FontAwesome5 name="car-side" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Hồ sơ', tabBarIcon: ({ color, size }) => <FontAwesome5 name="user-circle" size={size - 2} color={color} solid /> }}
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

      {/* History lists */}
      <RootStack.Screen name="RefuelsList" component={RefuelsListScreen}
        options={{ headerShown: true, ...headerOpts, title: '⛽ Lịch sử đổ xăng' }} />
      <RootStack.Screen name="OdometerList" component={OdometerListScreen}
        options={{ headerShown: true, ...headerOpts, title: '📍 Lịch sử ODO' }} />

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

      {/* Dossier & Health */}
      <RootStack.Screen name="Dossier" component={DossierScreen}
        options={{ headerShown: false }} />
      <RootStack.Screen name="Health" component={HealthScreen}
        options={{ headerShown: true, ...headerOpts, title: '🩺 Kiểm tra xe' }} />
    </RootStack.Navigator>
  );
}
