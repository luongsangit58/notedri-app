import React from 'react';
import { Image, View } from 'react-native';
import { NoriMood, NORI_MOOD_COLOR } from '../../services/nori/nori';

interface NoriAvatarProps {
  mood: NoriMood;
  size?: number;
}

// Rà soát 22/7 (user: muốn Nori trên app giống hệt Nori trên web, không phải
// icon mặt tự vẽ) - dùng ĐÚNG ảnh linh vật đang public/img/nori-icon.png bên
// web (chú robot lông trắng, tai/mào cam, mắt cam), thay vì icon FontAwesome.
// Nori chỉ có 1 ảnh (web cũng vậy, không có bộ ảnh biểu cảm riêng theo trạng
// thái) - trạng thái thể hiện qua dot màu góc dưới-phải, cùng cách web làm ở
// _nori_today.blade.php (dot màu cạnh nhãn trạng thái) thay vì đổi mặt Nori.
export default function NoriAvatar({ mood, size = 44 }: NoriAvatarProps) {
  const clr = NORI_MOOD_COLOR[mood];
  const dotSize = Math.max(12, Math.round(size * 0.32));

  return (
    <View style={{ width: size, height: size }}>
      <Image
        source={require('../../../assets/nori/nori-icon.png')}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 2,
          backgroundColor: clr,
          borderWidth: 2,
          borderColor: '#fff',
        }}
      />
    </View>
  );
}
