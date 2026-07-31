import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  savePairing,
  getPairingForVehicle,
  getAutoConnectPairing,
  setAutoConnect,
  removePairingForVehicle,
  clearPairings,
} from '../pairedDevices';

describe('pairedDevices - autoConnect (25/7)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('getAutoConnectPairing trả về pairing mới ghép (mặc định BẬT từ 31/7)', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    expect((await getAutoConnectPairing())?.vehicleId).toBe(1);
  });

  it('setAutoConnect(false) tắt riêng 1 xe, không ảnh hưởng xe khác vẫn đang bật mặc định', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    await savePairing({ bleDeviceId: 'CC:DD', vehicleId: 2, vehicleName: 'Xe 2' });

    await setAutoConnect(1, false);

    const xe2 = await getPairingForVehicle(2);
    expect(xe2?.autoConnect).not.toBe(false);

    const pairing = await getAutoConnectPairing();
    expect(pairing?.vehicleId).toBe(2);
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

  it('savePairing thay thế bản ghép cũ khi cùng một xe đổi sang thiết bị mới', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1', autoConnect: true });
    await savePairing({ bleDeviceId: 'CC:DD', vehicleId: 1, vehicleName: 'Xe 1' });

    const pairing = await getPairingForVehicle(1);
    expect(pairing?.bleDeviceId).toBe('CC:DD');
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

  it('removePairingForVehicle xoá đúng xe khỏi bộ nhớ pairing', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    await savePairing({ bleDeviceId: 'CC:DD', vehicleId: 2, vehicleName: 'Xe 2' });

    await removePairingForVehicle(1);

    expect(await getPairingForVehicle(1)).toBeNull();
    expect(await getPairingForVehicle(2)).not.toBeNull();
  });

  it('clearPairings xoá sạch toàn bộ pairing local', async () => {
    await savePairing({ bleDeviceId: 'AA:BB', vehicleId: 1, vehicleName: 'Xe 1' });
    await savePairing({ bleDeviceId: 'CC:DD', vehicleId: 2, vehicleName: 'Xe 2' });

    await clearPairings();

    expect(await getPairingForVehicle(1)).toBeNull();
    expect(await getPairingForVehicle(2)).toBeNull();
    expect(await getAutoConnectPairing()).toBeNull();
  });
});
