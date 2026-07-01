import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../utils/colors';
import { useT } from '../i18n';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorView({ message, onRetry }: Props) {
  const t = useT();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 24 }}>
      <Text style={{ color: colors.error, fontSize: 16, textAlign: 'center', marginBottom: 16 }}>{message ?? t('error.generic')}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{ backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{t('common.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
