import React from 'react';
import { View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { NoriMood, NORI_MOOD_COLOR, NORI_MOOD_ICON } from '../../services/nori/nori';

interface NoriAvatarProps {
  mood: NoriMood;
  size?: number;
}

// Avatar tròn của Nori: icon mặt biểu cảm đổi màu/hình theo tâm trạng (happy/
// warn/urgent/unknown) - không cần asset ảnh riêng, dùng FontAwesome5 sẵn có
// để nhất quán với phần còn lại của app.
export default function NoriAvatar({ mood, size = 44 }: NoriAvatarProps) {
  const clr = NORI_MOOD_COLOR[mood];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: clr + '22',
        borderWidth: 2,
        borderColor: clr,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <FontAwesome5 name={NORI_MOOD_ICON[mood]} size={size * 0.48} color={clr} solid />
    </View>
  );
}
