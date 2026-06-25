import React, { useMemo } from 'react';
import {
  View, KeyboardAvoidingView, ScrollView, Platform, Dimensions,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

// Fixed dark palette cho toàn bộ auth flow
export const C = {
  bg: '#0d1527',
  card: '#1a2744',
  inputBg: '#0d1527',
  inputBorder: '#2d3f63',
  text: '#e2e8f0',
  textMuted: '#cbd5e1',
  textSecondary: '#94a3b8',
  primary: '#f59e0b',
  divider: '#2d3f63',
  errorBg: '#7f1d1d55',
  errorBorder: '#b91c1c88',
  errorText: '#fca5a5',
  successBg: '#064e3b55',
  successBorder: '#059669aa',
  successText: '#6ee7b7',
} as const;

export const INPUT_STYLE = {
  backgroundColor: C.inputBg,
  borderWidth: 1,
  borderColor: C.inputBorder,
  borderRadius: 12,
  paddingHorizontal: 16,
  paddingVertical: 14,
  color: C.text,
  fontSize: 15,
} as const;

const BG_ICONS = [
  'gas-pump', 'tint', 'bicycle', 'car', 'motorcycle',
  'oil-can', 'wrench', 'gas-pump', 'tint', 'car',
] as const;
const BG_ROTATIONS = [0, 15, -10, 20];

export function BgPattern() {
  const { width, height } = Dimensions.get('window');
  const cols = Math.ceil(width / 90) + 1;
  const rows = Math.ceil(height / 90) + 2;
  const items = useMemo(
    () => Array.from({ length: cols * rows }, (_, i) => ({
      icon: BG_ICONS[i % BG_ICONS.length],
      rotate: BG_ROTATIONS[i % 4],
      x: (i % cols) * 90,
      y: Math.floor(i / cols) * 90,
    })),
    [cols, rows],
  );
  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.07 }}
      pointerEvents="none">
      {items.map((item, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: item.x,
            top: item.y,
            width: 90,
            height: 90,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: `${item.rotate}deg` }],
          }}>
          <FontAwesome5 name={item.icon} size={28} color="#ffffff" solid />
        </View>
      ))}
    </View>
  );
}

interface AuthContainerProps {
  children: React.ReactNode;
  center?: boolean;
}

export function AuthContainer({ children, center = true }: AuthContainerProps) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <BgPattern />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: center ? 'center' : 'flex-start',
            paddingHorizontal: 24,
            paddingVertical: 32,
          }}
          keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
