import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../utils/colors';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorView({ message = 'Đã có lỗi xảy ra', onRetry }: Props) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
      <Text style={{ color: colors.error, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>Thử lại</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
