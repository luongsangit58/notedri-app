import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useNoriAgentStore } from '../../store/noriAgentStore';
import { useObdSessionStore } from '../../store/obdSessionStore';
import { useSelectedVehicleStore } from '../../store/selectedVehicleStore';
import { useVehicles } from '../../hooks/useVehicles';
import { useAuthStore } from '../../store/authStore';
import { NoriFeedbackRating } from '../../api/nori';

const RATING_OPTIONS: { value: NoriFeedbackRating; label: string; emoji: string }[] = [
  { value: 'good', label: 'Đúng', emoji: '✅' },
  { value: 'partial', label: 'Một phần đúng', emoji: '🟡' },
  { value: 'bad', label: 'Sai', emoji: '❌' },
];

// Câu hỏi mẫu hiện ngay sau lời chào - user mới mở màn hình lần đầu không biết hỏi gì (góp ý
// thực tế lúc build app test), che rõ vài nhóm tool chính (sức khoẻ/chi phí/bảo dưỡng/hành
// trình) để user hình dung phạm vi Nori trả lời được. Chỉ hiện khi CHƯA có tin nhắn nào ngoài
// lời chào (uiMessages.length <= 1) - biến mất sau khi user bắt đầu hỏi, không chiếm chỗ mãi.
const SUGGESTED_QUESTIONS = [
  'Xe tôi sức khoẻ thế nào?',
  'Tháng này tôi tốn bao nhiêu tiền xăng?',
  'Xe tôi có gì sắp đến hạn không?',
  'Hôm nay tôi chạy được bao nhiêu km?',
];

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
 *
 * Chấm điểm câu trả lời (nhấn giữ bọt chat của Nori): ghi vào storage/logs/nori.log cùng
 * request_id của lượt hỏi-đáp đó, để test thủ công có log kèm đánh giá thật thay vì chỉ nhớ
 * trong đầu - theo yêu cầu track chất lượng trả lời trong giai đoạn test Phase 1.
 */
export default function NoriChatScreen() {
  const colors = useColors();
  const { uiMessages, isThinking, init, sendMessage, submitFeedback } = useNoriAgentStore();
  const userName = useAuthStore((s) => s.user?.name);
  const [input, setInput] = useState('');
  const [feedbackRequestId, setFeedbackRequestId] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
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

  const handleSend = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  };

  const openFeedback = (requestId?: string) => {
    if (!requestId) return; // Bọt chào tĩnh không có requestId - không chấm điểm được.
    setFeedbackNote('');
    setFeedbackRequestId(requestId);
  };

  const handleRate = (rating: NoriFeedbackRating) => {
    if (!feedbackRequestId) return;
    submitFeedback(feedbackRequestId, rating, feedbackNote.trim() || undefined);
    setFeedbackRequestId(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // 'undefined' trên Android (dùng ở các form khác trong app) KHÔNG đủ cho màn hình này:
        // form thường chỉ cần cuộn để thấy input, còn ở đây thanh nhập BỊ GHIM cố định dưới
        // cùng (không nằm trong ScrollView) nên bàn phím che mất hoàn toàn nếu không tự đẩy
        // lên - dùng 'height' giống đúng pattern modal chấm điểm bên dưới trong CHÍNH file
        // này (ProfileScreen cũng dùng 'height' cho modal). Bug thật phát hiện lúc build app
        // test, không phải suy đoán.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
            <TouchableOpacity
              activeOpacity={item.role === 'assistant' && item.requestId ? 0.7 : 1}
              onLongPress={item.role === 'assistant' ? () => openFeedback(item.requestId) : undefined}
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
              {item.feedbackRating && (
                <Text style={{ marginTop: 4, fontSize: 12 }}>
                  {RATING_OPTIONS.find((r) => r.value === item.feedbackRating)?.emoji} Đã chấm điểm
                </Text>
              )}
            </TouchableOpacity>
          )}
        />

        {uiMessages.length <= 1 && !isThinking && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8 }}
          >
            {SUGGESTED_QUESTIONS.map((q) => (
              <TouchableOpacity
                key={q}
                onPress={() => handleSend(q)}
                style={{
                  paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16,
                  backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13 }}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

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
            onSubmitEditing={() => handleSend()}
            editable={!isThinking}
          />
          <TouchableOpacity
            onPress={() => handleSend()}
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

      <Modal visible={!!feedbackRequestId} transparent animationType="slide" onRequestClose={() => setFeedbackRequestId(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 12 }}>
              Câu trả lời này thế nào?
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {RATING_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => handleRate(opt.value)}
                  style={{
                    flex: 1, alignItems: 'center', paddingVertical: 12,
                    backgroundColor: colors.background, borderRadius: 10,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{opt.emoji}</Text>
                  <Text style={{ color: colors.text, fontSize: 12, marginTop: 4 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={feedbackNote}
              onChangeText={setFeedbackNote}
              placeholder="Ghi chú thêm (tuỳ chọn)..."
              placeholderTextColor={colors.textSecondary}
              multiline
              style={{
                backgroundColor: colors.background, color: colors.text,
                borderRadius: 10, padding: 12, fontSize: 14, minHeight: 60,
                borderWidth: 1, borderColor: colors.border, marginBottom: 12,
              }}
            />
            <TouchableOpacity onPress={() => setFeedbackRequestId(null)} style={{ alignItems: 'center', padding: 8 }}>
              <Text style={{ color: colors.textSecondary }}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
