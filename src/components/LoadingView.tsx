import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useColors } from '../utils/theme';

export default function LoadingView() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
