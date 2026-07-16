// Mock thủ công (16/7): obdKeepAliveService.ts import expo-task-manager ở module
// scope - không có mock này thì MỌI test import obdLiveMonitor.ts (transitive)
// sẽ vỡ vì requireNativeModule('ExpoTaskManager') không chạy được trong Jest.
module.exports = {
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => {}),
};
