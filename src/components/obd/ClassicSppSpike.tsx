import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import NotedriBtPairing from '../../../modules/notedri-bt-pairing/src';

/**
 * Spike TẠM THỜI (22/7, xem [[feedback-obd-android-headunit-fixes]] memory) -
 * chỉ để xác nhận: đầu Android ô tô có BLE hỏng (xác nhận qua nRF Connect) vẫn
 * ghép nối + trả lời được qua Bluetooth Classic (SPP) hay không, trước khi
 * quyết định đầu tư làm trọn vẹn 1 mode kết nối Classic song song với BLE.
 * XOÁ khối này (và import ở OBDSetupScreen.tsx) sau khi có kết luận - không
 * phải UI sản phẩm cuối cùng, không cần đẹp/i18n.
 */
export default function ClassicSppSpike() {
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState('1234');
  const [busy, setBusy] = useState(false);

  if (Platform.OS !== 'android') return null;

  async function handleTest() {
    if (!address.trim()) {
      Alert.alert('Spike Classic BT', 'Nhập địa chỉ MAC của Vgate trước (xem trong Cài đặt Bluetooth hệ thống).');
      return;
    }
    setBusy(true);
    try {
      const response = await NotedriBtPairing.pairAndTestAtz(address.trim().toUpperCase(), pin.trim());
      Alert.alert('Thành công', `Phản hồi ATZ:\n${response}`);
    } catch (e: any) {
      Alert.alert('Thất bại', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ marginTop: 24, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#F59E0B', gap: 8 }}>
      <Text style={{ color: '#F59E0B', fontWeight: '700', fontSize: 12 }}>
        SPIKE - Test kết nối Classic Bluetooth (tạm thời, sẽ xoá)
      </Text>
      <TextInput
        placeholder="Địa chỉ MAC Vgate (vd D2:E0:2F:8D:48:3F)"
        value={address}
        onChangeText={setAddress}
        autoCapitalize="characters"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, fontSize: 13 }}
      />
      <TextInput
        placeholder="PIN"
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, fontSize: 13 }}
      />
      <TouchableOpacity
        onPress={handleTest}
        disabled={busy}
        style={{ backgroundColor: '#F59E0B', borderRadius: 6, padding: 10, alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '600' }}>Ghép nối + gửi ATZ</Text>}
      </TouchableOpacity>
    </View>
  );
}
