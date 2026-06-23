import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../utils/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
  hint?: string;
}

export default function OcrCamera({ visible, onClose, onResult, hint }: Props) {
  const [manualValue, setManualValue] = useState('');
  const [imagePicked, setImagePicked] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: false });

    if (!result.canceled && result.assets[0]) {
      // TODO: When ejecting to bare workflow, integrate @react-native-ml-kit/text-recognition here
      // For MVP: resize + grayscale the image, then ask user to confirm the extracted value manually
      await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImagePicked(true);
    }
  };

  const handleConfirm = () => {
    onResult(manualValue);
    setManualValue('');
    setImagePicked(false);
    onClose();
  };

  const handleClose = () => {
    setManualValue('');
    setImagePicked(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
            {hint ?? 'Đọc số từ ảnh'}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 20 }}>
            Chọn ảnh để đọc số. Sau khi chọn, nhập hoặc chỉnh sửa số bên dưới.
          </Text>

          {!imagePicked ? (
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                onPress={() => pickImage(true)}
                style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="camera" size={14} color="#fff" solid />
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Chụp ảnh</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => pickImage(false)}
                style={{ backgroundColor: colors.card, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <FontAwesome5 name="images" size={14} color={colors.text} solid />
                  <Text style={{ color: colors.text, fontWeight: '600' }}>Chọn từ thư viện</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={{ color: colors.textSecondary, marginBottom: 8 }}>Nhập giá trị đọc được:</Text>
              <TextInput
                value={manualValue}
                onChangeText={setManualValue}
                keyboardType="numeric"
                placeholder="Nhập số..."
                placeholderTextColor={colors.textSecondary}
                style={{
                  backgroundColor: colors.background,
                  color: colors.text,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 20,
                  fontWeight: '600',
                  marginBottom: 16,
                }}
              />
              <TouchableOpacity
                onPress={handleConfirm}
                style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Xác nhận</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={handleClose} style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={{ color: colors.textSecondary }}>Huỷ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
