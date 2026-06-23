import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../utils/colors';

export default function QuickAddFAB() {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation<any>();

  const handleRefuel = () => {
    setOpen(false);
    navigation.navigate('AddRefuel');
  };

  const handleOdometer = () => {
    setOpen(false);
    navigation.navigate('AddOdometer');
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.primary,
          justifyContent: 'center',
          alignItems: 'center',
          elevation: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.4,
          shadowRadius: 4,
          zIndex: 100,
        }}>
        <FontAwesome5 name="plus" size={22} color="#fff" solid />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setOpen(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>Thêm nhanh</Text>
            <TouchableOpacity
              onPress={handleRefuel}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: 10 }}>
              <View style={{ width: 32, alignItems: 'center', marginRight: 12 }}>
                <FontAwesome5 name="gas-pump" size={20} color={colors.primary} solid />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Đổ xăng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleOdometer}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: 10 }}>
              <View style={{ width: 32, alignItems: 'center', marginRight: 12 }}>
                <FontAwesome5 name="road" size={20} color={colors.primary} solid />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Cập nhật ODO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setOpen(false); navigation.navigate('AddService' as never); }}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: 12, marginBottom: 10 }}>
              <View style={{ width: 32, alignItems: 'center', marginRight: 12 }}>
                <FontAwesome5 name="wrench" size={20} color={colors.primary} solid />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Bảo dưỡng mới</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setOpen(false); navigation.navigate('AddReminder' as never); }}
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.card, borderRadius: 12 }}>
              <View style={{ width: 32, alignItems: 'center', marginRight: 12 }}>
                <FontAwesome5 name="bell" size={20} color={colors.primary} solid />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Thêm nhắc nhở</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setOpen(false)} style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.textSecondary }}>Huỷ</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
