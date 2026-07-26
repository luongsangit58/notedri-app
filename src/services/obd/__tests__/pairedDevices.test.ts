import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  savePairing,
  getPairingForVehicle,
  getAutoConnectPairing,
  setAutoConnect,
} from '../pairedDevices';

describe('pairedDevices - autoConnect (25/7)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('getAutoConnectPairing trả null khi chưa xe nào bật', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    expect(await getAutoConnectPairing()).toBeNull();
  });

  it('setAutoConnect bật cho đúng xe, không ảnh hưởng xe khác', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    await savePairing({ bleDeviceId: 'CC:DD', vehicleId: 2, vehicleName: 'Xe 2' });

    await setAutoConnect(1, true);

    const pairing = await getAutoConnectPairing();
    expect(pairing?.vehicleId).toBe(1);

    const xe2 = await getPairingForVehicle(2);
    expect(xe2?.autoConnect).toBeFalsy();
  });

  it('getAutoConnectPairing chọn xe kết nối GẦN NHẤT khi nhiều xe cùng bật', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1', lastConnectedAt: 1000 });
    await savePairing({ bleDeviceId: 'CC:DD', vehicleId: 2, vehicleName: 'Xe 2', lastConnectedAt: 2000 });
    await setAutoConnect(1, true);
    await setAutoConnect(2, true);

    const pairing = await getAutoConnectPairing();
    expect(pairing?.vehicleId).toBe(2);
  });

  it('savePairing (kết nối lại) KHÔNG xoá mất lựa chọn autoConnect đã bật trước đó', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    await setAutoConnect(1, true);

    // Mô phỏng 1 lần kết nối thành công MỚI (như useObd.ts finishConnect gọi lại
    // savePairing mà không biết gì về field autoConnect).
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1', transport: 'ble' });

    const pairing = await getPairingForVehicle(1);
    expect(pairing?.autoConnect).toBe(true);
  });

  it('setAutoConnect(false) tắt được lựa chọn đã bật', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    await setAutoConnect(1, true);
    await setAutoConnect(1, false);

    expect(await getAutoConnectPairing()).toBeNull();
  });

  it('setAutoConnect bỏ qua im lặng nếu xe chưa từng ghép thiết bị nào', async () => {
    await expect(setAutoConnect(999, true)).resolves.toBeUndefined();
    expect(await getAutoConnectPairing()).toBeNull();
  });
});
