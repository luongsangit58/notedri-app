import React from 'react';
import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';
import { ServicePhoto } from '../api/services';

/**
 * Ô chọn ảnh hoá đơn cho bản ghi bảo dưỡng (dùng cho Add + Edit).
 * - photo: ảnh vừa chọn (chưa lưu). existingUrl: ảnh đã lưu (màn Edit).
 * - removed: cờ xoá ảnh đang lưu.
 */
export default function ReceiptPicker({
  photo, existingUrl, removed,
  onPicked, onRemoved,
}: {
  photo: ServicePhoto | null;
  existingUrl?: string | null;
  removed?: boolean;
  onPicked: (p: ServicePhoto | null) => void;
  onRemoved: (b: boolean) => void;
}) {
  const colors = useColors();
  const t = useT();

  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('common.error'), t('add_vehicle.photo_permission')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      onPicked({ uri: asset.uri, type: asset.mimeType ?? 'image/jpeg', name: 'receipt.jpg' });
      onRemoved(false);
    }
  };

  // Ảnh đang hiển thị: ưu tiên ảnh vừa chọn, rồi tới ảnh đã lưu (nếu chưa bấm xoá).
  const previewUri = photo?.uri ?? (!removed ? (existingUrl ?? null) : null);

  return (
    <View style={{ marginBottom: 12 }}>
      {previewUri ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Image source={{ uri: previewUri }} style={{ width: 72, height: 72, borderRadius: 10, borderWidth: 1, borderColor: colors.border }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={pick}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
              <FontAwesome5 name="sync" size={12} color={colors.textSecondary} solid />
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{t('services.receipt_change')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onPicked(null); onRemoved(true); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: colors.error + '66' }}>
              <FontAwesome5 name="trash" size={12} color={colors.error} solid />
              <Text style={{ color: colors.error, fontSize: 13, fontWeight: '600' }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={pick}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
            backgroundColor: colors.surface,
          }}>
          <FontAwesome5 name="camera" size={15} color={colors.primary} solid />
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{t('services.receipt_add')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
