import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useNoriAgentStore } from '../../store/noriAgentStore';
import { useObdSessionStore } from '../../store/obdSessionStore';

/**
 * Màn hình chat TEXT để test Phase 1 (docs/nori-agent-plan.md mục 10.1, 13) - chưa nối
 * voice (Phase 3). Dùng activeVehicleId từ obdSessionStore (xe đang có phiên OBD sống) làm
 * ToolContext.vehicleId - đúng tinh thần "activeVehicleId là tham số thay đổi được" (mục 7).
 */
export default function NoriChatScreen() {
  const colors = useColors();
  const { uiMessages, isThinking, init, sendMessage } = useNoriAgentStore();
  const activeVehicleId = useObdSessionStore((s) => s.vehicleId);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    init(() => useObdSessionStore.getState().vehicleId);
  }, [init]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={uiMessages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
              Hỏi Nori về tình trạng xe, chi phí, hoặc lịch bảo dưỡng nhé.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                backgroundColor: item.role === 'user' ? colors.primary : colors.surface,
                borderRadius: 14,
                paddingVertical: 10,
                paddingHorizontal: 14,
                maxWidth: '85%',
              }}
            >
              <Text style={{ color: item.role === 'user' ? '#fff' : colors.text }}>{item.text}</Text>
            </View>
          )}
        />

        {isThinking && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.textSecondary }}>Nori đang kiểm tra...</Text>
          </View>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            gap: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Nhắn cho Nori..."
            placeholderTextColor={colors.textSecondary}
            style={{
              flex: 1,
              backgroundColor: colors.background,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              color: colors.text,
            }}
            onSubmitEditing={handleSend}
            editable={!isThinking}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={isThinking || !input.trim()}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
              opacity: isThinking || !input.trim() ? 0.5 : 1,
            }}
          >
            <FontAwesome5 name="paper-plane" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
