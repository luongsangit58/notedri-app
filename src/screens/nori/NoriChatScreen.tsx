import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useNoriAgentStore } from '../../store/noriAgentStore';
import { useObdSessionStore } from '../../store/obdSessionStore';
import { useSelectedVehicleStore } from '../../store/selectedVehicleStore';
import { useVehicles } from '../../hooks/useVehicles';
import { useAuthStore } from '../../store/authStore';

/**
 * Màn hình chat TEXT để test Phase 1 (docs/nori-agent-plan.md mục 10.1, 13) - chưa nối
 * voice (Phase 3).
 *
 * ToolContext.vehicleId ưu tiên xe đang có phiên OBD sống (obdSessionStore) - đúng cho
 * vehicleTools (mục 7: activeVehicleId là tham số thay đổi được, không hardcode 1 xe). Nhưng
 * businessTools (health/trip/odo/expense/maintenance) không cần BLE để có dữ liệu - nếu CHỈ
 * dùng obdSessionStore, mọi câu hỏi kiểu "tháng này tốn bao nhiêu tiền xăng" sẽ luôn báo
 * "unavailable" khi chưa kết nối OBD dù xe đã có đủ dữ liệu trên server. Fallback theo đúng
 * cách HomeScreen.tsx đang chọn "xe đang xem" (selectedVehicleStore -> xe mặc định -> xe đầu
 * tiên) để business tools hoạt động độc lập với BLE, giống hành vi user thấy ở Trang chủ.
 */
export default function NoriChatScreen() {
  const colors = useColors();
  const { uiMessages, isThinking, init, sendMessage } = useNoriAgentStore();
  const userName = useAuthStore((s) => s.user?.name);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];
  // init() chỉ tạo NoriAgent 1 LẦN DUY NHẤT (no-op nếu gọi lại) - closure truyền vào lần đầu
  // sẽ bị "đóng băng" mãi mãi nếu đọc thẳng `vehicles` (lúc đó danh sách xe thường CHƯA tải
  // xong, `vehicles = []`). Dùng ref để callback luôn đọc được danh sách xe MỚI NHẤT tại thời
  // điểm NoriAgent thực sự gọi getVehicleId(), bất kể init() chạy trước hay sau khi tải xong.
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  useEffect(() => {
    init(() => {
      const obdVehicleId = useObdSessionStore.getState().vehicleId;
      if (obdVehicleId) return obdVehicleId;
      const selectedVehicleId = useSelectedVehicleStore.getState().selectedVehicleId;
      if (selectedVehicleId) return selectedVehicleId;
      const defaultVehicle = vehiclesRef.current.find((v) => v.is_default) ?? vehiclesRef.current[0];
      return defaultVehicle?.id ?? null;
    }, userName);
  }, [init, userName]);

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
