import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../utils/colors';

export default function LoadingView() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
