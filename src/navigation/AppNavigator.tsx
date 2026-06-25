import React from 'react';
import { TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useColors, ColorPalette } from '../utils/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { useT } from '../i18n';

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
import ChangePasswordScreen from '../screens/profile/ChangePasswordScreen';
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
import GarageGuideScreen from '../screens/services/GarageGuideScreen';
import YearReviewScreen from '../screens/reports/YearReviewScreen';
import FuelPricesScreen from '../screens/refuels/FuelPricesScreen';
import FeedbackScreen from '../screens/profile/FeedbackScreen';
import PremiumScreen from '../screens/profile/PremiumScreen';
import AboutScreen from '../screens/profile/AboutScreen';
import NotificationSettingsScreen from '../screens/profile/NotificationSettingsScreen';
import ExportDataScreen from '../screens/profile/ExportDataScreen';
import OBDSetupScreen from '../screens/obd/OBDSetupScreen';
import OBDDashboardScreen from '../screens/obd/OBDDashboardScreen';
import OBDTripsScreen from '../screens/obd/OBDTripsScreen';

const Tab = createBottomTabNavigator();
const RootStack = createStackNavigator();

function VehiclesStack({ colors }: { colors: ColorPalette }) {
  const Stack = createStackNavigator();
  const t = useT();
  const headerOpts = {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
  };
  return (
    <Stack.Navigator screenOptions={headerOpts}>
      <Stack.Screen name="VehiclesList" component={VehiclesScreen} options={{ title: t('vehicles.title') }} />
      <Stack.Screen name="VehicleDetail" component={VehicleDetailScreen} options={({ route }: any) => ({ title: route.params?.vehicleName ?? t('common.vehicle') })} />
    </Stack.Navigator>
  );
}

function ServicesStack({ colors }: { colors: ColorPalette }) {
  const Stack = createStackNavigator();
  const t = useT();
  const headerOpts = {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
  };
  return (
    <Stack.Navigator screenOptions={headerOpts}>
      <Stack.Screen
        name="ServicesList"
        component={ServicesScreen}
        options={({ navigation }: any) => ({
          title: t('nav.tab_services'),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('GarageGuide')}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <FontAwesome5 name="toolbox" size={18} color={colors.primary} solid />
            </TouchableOpacity>
          ),
        })}
      />
    </Stack.Navigator>
  );
}

function ThemedTabNavigator() {
  const colors = useColors();
  const t = useT();
  const VehiclesStackColored = () => <VehiclesStack colors={colors} />;
  const ServicesStackColored = () => <ServicesStack colors={colors} />;
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
        options={{ headerShown: false, title: t('nav.tab_dashboard'), tabBarIcon: ({ color, size }) => <FontAwesome5 name="home" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Timeline"
        component={TimelineScreen}
        options={{ title: t('nav.tab_timeline'), tabBarIcon: ({ color, size }) => <FontAwesome5 name="history" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Services"
        component={ServicesStackColored}
        options={{ title: t('nav.tab_services'), headerShown: false, tabBarIcon: ({ color, size }) => <FontAwesome5 name="wrench" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Vehicles"
        component={VehiclesStackColored}
        options={{ title: t('nav.tab_vehicles'), headerShown: false, tabBarIcon: ({ color, size }) => <FontAwesome5 name="car-side" size={size - 2} color={color} solid /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: t('nav.tab_profile'), tabBarIcon: ({ color, size }) => <FontAwesome5 name="user-circle" size={size - 2} color={color} solid /> }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const colors = useColors();
  const t = useT();
  const headerOpts = {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.text,
  };
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="Tabs" component={ThemedTabNavigator} />

      {/* Refuel & ODO */}
      <RootStack.Screen name="AddRefuel" component={AddRefuelScreen}
        options={{ headerShown: true, ...headerOpts, title: t('refuels.add_title') }} />
      <RootStack.Screen name="AddOdometer" component={AddOdometerScreen}
        options={{ headerShown: true, ...headerOpts, title: t('odometer.add_title') }} />
      <RootStack.Screen name="EditOdometer" component={EditOdometerScreen}
        options={{ headerShown: false }} />

      {/* Services */}
      <RootStack.Screen name="AddService" component={AddServiceScreen}
        options={{ headerShown: true, ...headerOpts, title: t('services.add_title') }} />

      {/* Vehicles */}
      <RootStack.Screen name="AddVehicle" component={AddVehicleScreen}
        options={{ headerShown: true, ...headerOpts, title: t('vehicles.add') }} />
      <RootStack.Screen name="EditVehicle" component={EditVehicleScreen}
        options={{ headerShown: true, ...headerOpts, title: t('common.edit') }} />

      {/* Profile */}
      <RootStack.Screen name="EditProfile" component={EditProfileScreen}
        options={{ headerShown: true, ...headerOpts, title: t('profile.edit') }} />
      <RootStack.Screen name="ChangePassword" component={ChangePasswordScreen}
        options={{ headerShown: true, ...headerOpts, title: t('change_password.title') }} />

      {/* Reminders */}
      <RootStack.Screen name="Reminders" component={RemindersScreen}
        options={{ headerShown: true, ...headerOpts, title: t('reminders.title') }} />
      <RootStack.Screen name="AddReminder" component={AddReminderScreen}
        options={{ headerShown: false }} />
      <RootStack.Screen name="EditReminder" component={EditReminderScreen}
        options={{ headerShown: false }} />

      {/* Nearby Stations */}
      <RootStack.Screen name="NearbyStations" component={NearbyStationsScreen}
        options={{ headerShown: true, ...headerOpts, title: t('nearby_stations.title') }} />
      <RootStack.Screen name="FuelPrices" component={FuelPricesScreen}
        options={{ headerShown: true, ...headerOpts, title: t('fuel_prices.title') }} />

      {/* History lists */}
      <RootStack.Screen name="RefuelsList" component={RefuelsListScreen}
        options={({ navigation }: any) => ({
          headerShown: true,
          ...headerOpts,
          title: t('refuels.title'),
          headerRight: () => (
            <TouchableOpacity
              onPress={() => navigation.navigate('FuelPrices')}
              style={{ marginRight: 16 }}>
              <FontAwesome5 name="tags" size={18} color={colors.primary} solid />
            </TouchableOpacity>
          ),
        })} />
      <RootStack.Screen name="OdometerList" component={OdometerListScreen}
        options={{ headerShown: true, ...headerOpts, title: t('odometer.title') }} />

      {/* Edit */}
      <RootStack.Screen name="EditRefuel" component={EditRefuelScreen}
        options={{ headerShown: true, ...headerOpts, title: t('refuels.edit_title') }} />
      <RootStack.Screen name="EditService" component={EditServiceScreen}
        options={{ headerShown: true, ...headerOpts, title: t('services.edit_title') }} />

      {/* Notifications & Reports */}
      <RootStack.Screen name="Notifications" component={NotificationsScreen}
        options={{ headerShown: true, ...headerOpts, title: t('notifications.title') }} />
      <RootStack.Screen name="Reports" component={ReportsScreen}
        options={{ headerShown: true, ...headerOpts, title: t('reports.title') }} />

      {/* Dossier & Health */}
      <RootStack.Screen name="Dossier" component={DossierScreen}
        options={{ headerShown: false }} />
      <RootStack.Screen name="Health" component={HealthScreen}
        options={{ headerShown: true, ...headerOpts, title: t('health.title') }} />

      {/* Garage Guide */}
      <RootStack.Screen name="GarageGuide" component={GarageGuideScreen}
        options={{ headerShown: true, ...headerOpts, title: t('garage_guide.title') }} />

      {/* Feedback */}
      <RootStack.Screen name="Feedback" component={FeedbackScreen}
        options={{ headerShown: true, ...headerOpts, title: t('feedback.title') }} />

      {/* About */}
      <RootStack.Screen name="About" component={AboutScreen}
        options={{ headerShown: true, ...headerOpts, title: t('about.title') }} />

      {/* Notification settings */}
      <RootStack.Screen name="NotificationSettings" component={NotificationSettingsScreen}
        options={{ headerShown: true, ...headerOpts, title: t('notification_settings.title') }} />

      {/* Export data */}
      <RootStack.Screen name="ExportData" component={ExportDataScreen}
        options={{ headerShown: true, ...headerOpts, title: t('export.title') }} />

      {/* Premium */}
      <RootStack.Screen name="Premium" component={PremiumScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#1C1207' },
          headerTintColor: '#F59E0B',
          headerTitleStyle: { fontWeight: '800', color: '#F59E0B' },
          title: t('premium.title'),
        }} />

      {/* OBD */}
      <RootStack.Screen name="OBDSetup" component={OBDSetupScreen}
        options={{ headerShown: false }} />
      <RootStack.Screen name="OBDDashboard" component={OBDDashboardScreen}
        options={{ headerShown: false }} />
      <RootStack.Screen name="OBDTrips" component={OBDTripsScreen}
        options={{ headerShown: false }} />

      {/* Year Review */}
      <RootStack.Screen name="YearReview" component={YearReviewScreen}
        options={({ route }: any) => ({
          headerShown: true,
          headerStyle: { backgroundColor: '#0b1220' },
          headerTintColor: '#e8eef9',
          headerTitleStyle: { fontWeight: '800', color: '#e8eef9' },
          title: t('year_review.title', { year: route.params?.year ?? '' }),
        })} />
    </RootStack.Navigator>
  );
}
