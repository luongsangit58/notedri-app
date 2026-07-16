// Mock thủ công (16/7): obdKeepAliveService.ts (và GpsTripTracker.ts nếu sau này
// có test import tới) dùng expo-location ở module scope - cần mock global để
// Jest không cố load native module thật.
module.exports = {
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  ActivityType: { Other: 1, AutomotiveNavigation: 2, Fitness: 3, OtherNavigation: 4, Airborne: 5 },
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => {}),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'undetermined' })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  enableNetworkProviderAsync: jest.fn(async () => {}),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 0, longitude: 0, speed: 0, accuracy: 5 } })),
};
