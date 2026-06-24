import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  returnKeyType?: 'done' | 'next' | 'go' | 'search' | 'send';
  onSubmitEditing?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
}

export default function PasswordInput({
  value,
  onChangeText,
  placeholder = '••••••••',
  style,
  returnKeyType,
  onSubmitEditing,
  inputRef,
}: Props) {
  const colors = useColors();
  const [show, setShow] = useState(false);

  return (
    <View style={[{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    }, style]}>
      <TextInput
        ref={inputRef}
        style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
      <TouchableOpacity
        onPress={() => setShow(s => !s)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <FontAwesome5
          name={show ? 'eye-slash' : 'eye'}
          size={16}
          color={colors.textSecondary}
          solid
        />
      </TouchableOpacity>
    </View>
  );
}
