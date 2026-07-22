import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import NotedriBtPairing, { ClassicBtDevice } from '../../../modules/notedri-bt-pairing/src/NotedriBtPairingModule';
import { bleService } from '../../services/obd/BleService';

/**
 * Spike TẠM THỜI (22/7, xem [[feedback-obd-android-headunit-fixes]] memory) -
 * chỉ để xác nhận: đầu Android ô tô có BLE hỏng (xác nhận qua nRF Connect) vẫn
 * ghép nối + trả lời được qua Bluetooth Classic (SPP) hay không, trước khi
 * quyết định đầu tư làm trọn vẹn 1 mode kết nối Classic song song với BLE.
 * XOÁ khối này (và import ở OBDSetupScreen.tsx) sau khi có kết luận - không
 * phải UI sản phẩm cuối cùng, không cần đẹp/i18n. Bấm chọn thiết bị từ danh
 * sách quét được - KHÔNG bắt gõ tay địa chỉ MAC (rà soát 22/7).
 */
export default function ClassicSppSpike() {
  const [pin, setPin] = useState('1234');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<ClassicBtDevice[]>([]);
  const [testingAddress, setTestingAddress] = useState<string | null>(null);

  if (Platform.OS !== 'android') return null;

  // Ghi vào ĐÚNG session log mà nút "Xuất log phiên (gỡ lỗi)" đã xuất - user
  // quen sẵn cách lấy log này, khỏi phải chụp màn hình/mô tả lại bằng lời
  // (rà soát 22/7, user hỏi có log để gửi không nếu máy không chạy được).
  async function handleScan() {
    setScanning(true);
    setDevices([]);
    bleService.logDiagnostic('#classic_spike', 'discoverDevices: start');
    try {
      const found = await NotedriBtPairing.discoverDevices();
      setDevices(found);
      bleService.logDiagnostic(
        '#classic_spike',
        `discoverDevices: found ${found.length} - ${found.map((d) => `${d.name}(${d.address}${d.bonded ? ',bonded' : ''})`).join('; ')}`
      );
      if (found.length === 0) {
        Alert.alert('Spike Classic BT', 'Không tìm thấy thiết bị nào.');
      }
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      bleService.logDiagnostic('#classic_spike', `discoverDevices: error - ${msg}`);
      Alert.alert('Quét thất bại', msg);
    } finally {
      setScanning(false);
    }
  }

  async function handleTest(device: ClassicBtDevice) {
    setTestingAddress(device.address);
    bleService.logDiagnostic('#classic_spike', `pairAndTestAtz: start ${device.address} pin=${pin.trim()}`);
    try {
      const response = await NotedriBtPairing.pairAndTestAtz(device.address, pin.trim());
      bleService.logDiagnostic('#classic_spike', `pairAndTestAtz: ok response=${response}`);
      Alert.alert('Thành công', `Phản hồi ATZ:\n${response}`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      bleService.logDiagnostic('#classic_spike', `pairAndTestAtz: error - ${msg}`);
      Alert.alert('Thất bại', msg);
    } finally {
      setTestingAddress(null);
    }
  }

  return (
    <View style={{ marginTop: 24, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B', gap: 8 }}>
      <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 12 }}>
        SPIKE - Test kết nối Classic Bluetooth (tạm thời, sẽ xoá)
      </Text>
      <TextInput
        placeholder="PIN"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, fontSize: 13 }}
      />
      <TouchableOpacity
        onPress={handleScan}
        disabled={scanning}
        style={{ backgroundColor: '#F59E0B', borderRadius: 6, padding: 10, alignItems: 'center', opacity: scanning ? 0.6 : 1 }}>
        {scanning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Quét thiết bị Classic (~10s)</Text>}
      </TouchableOpacity>
      {devices.map((d) => (
        <TouchableOpacity
          key={d.address}
          onPress={() => handleTest(d)}
          disabled={testingAddress !== null}
          style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            padding: 10, borderRadius: 6, borderWidth: 1, borderColor: '#ccc',
            opacity: testingAddress !== null && testingAddress !== d.address ? 0.5 : 1,
          }}>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{d.name}{d.bonded ? ' (đã ghép)' : ''}</Text>
            <Text style={{ fontSize: 11, color: '#888' }}>{d.address}</Text>
          </View>
          {testingAddress === d.address ? <ActivityIndicator size="small" /> : <Text style={{ color: '#F59E0B' }}>Test ATZ</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}
