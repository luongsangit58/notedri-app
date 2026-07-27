import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '../../utils/theme';
import { useNoriAgentStore } from '../../store/noriAgentStore';
import { useInitNoriAgent } from '../../agent/useInitNoriAgent';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import VoiceWaveform from '../../components/nori/VoiceWaveform';
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
  // Thêm 2026-07-27 (bug thật: nói "ghi ODO" bằng giọng nói bị STT nghe nhầm thành "đi ô tô"
  // hoặc từ khác - "ODO" là từ vay mượn, dễ nhầm hơn nhiều so với "công-tơ-mét" (đúng thuật ngữ
  // app đã dùng ở AddOdometerScreen). Chip này DẠY user gõ/nói đúng cụm từ ít bị nghe nhầm hơn,
  // thay vì cố sửa lỗi nhận diện giọng nói ở tầng app (không kiểm soát được STT engine).
  'Ghi công-tơ-mét xe tôi',
];

/**
 * Màn hình chat TEXT + VOICE (docs/nori-agent-plan.md mục 10.1, 13, Phase 3).
 *
 * Voice (thêm 2026-07-27): tái dùng NGUYÊN `useVoiceInput` (STT, đã có sẵn cho nhập ODO/số
 * tiền) - chỉ dùng tham số `raw` (transcript gốc) thay vì `parsed` (parser dành riêng cho số).
 * TTS dùng `expo-speech` (MỚI cài - cần rebuild app, không chỉ reload JS). Chỉ tự đọc to câu
 * trả lời nếu LƯỢT HỎI VỪA RỒI là bằng giọng nói (gõ chữ thì không đọc, tránh làm phiền) -
 * theo dõi qua `lastInputWasVoiceRef`. Bấm mic lúc Nori đang đọc sẽ NGẮT LỜI (dừng TTS) trước
 * khi bắt đầu nghe, vì không nghe-nói được cùng lúc.
 *
 * CHƯA làm ở lượt này (cố tình giới hạn phạm vi, xem trao đổi với user 2026-07-27): "phản hồi
 * hai pha" (câu đệm "để mình kiểm tra..." trước khi tool chạy xong) - đọc thẳng câu trả lời
 * CUỐI CÙNG như đường text, có thể có độ trễ trước khi Nori bắt đầu nói nếu phải gọi tool.
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
  const {
    uiMessages, isThinking, sendMessage, submitFeedback, pendingConfirmation, resolveConfirmation,
  } = useNoriAgentStore();
  useInitNoriAgent();
  const [input, setInput] = useState('');
  const [feedbackRequestId, setFeedbackRequestId] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const listRef = useRef<FlatList>(null);

  const { listen, stop: stopListening, status: voiceStatus, error: voiceError, volume: voiceVolume } = useVoiceInput();
  const [isSpeaking, setIsSpeaking] = useState(false);
  // true nếu lượt hỏi VỪA RỒI là bằng giọng nói - chỉ đọc to trả lời trong trường hợp đó
  // (gõ chữ thì Nori không tự đọc, tránh gây phiền/ồn không mong muốn).
  const lastInputWasVoiceRef = useRef(false);
  const prevMessageCountRef = useRef(uiMessages.length);

  useEffect(() => {
    const newMessage = uiMessages[uiMessages.length - 1];
    const hasNewMessage = uiMessages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = uiMessages.length;

    if (hasNewMessage && newMessage?.role === 'assistant' && lastInputWasVoiceRef.current) {
      lastInputWasVoiceRef.current = false;
      Speech.speak(newMessage.text, {
        language: 'vi-VN',
        onStart: () => setIsSpeaking(true),
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  }, [uiMessages]);

  // Dừng TTS khi rời màn hình - không để Nori tiếp tục nói sau khi user đã back ra.
  useEffect(() => () => { Speech.stop(); }, []);

  const handleSend = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  };

  const handleMicPress = async () => {
    if (isSpeaking) {
      await Speech.stop(); // Ngắt lời Nori trước - không nghe-nói được cùng lúc.
      setIsSpeaking(false);
    }
    if (voiceStatus === 'listening') {
      stopListening();
      return;
    }
    await listen((_parsed, raw) => {
      if (raw.trim()) {
        lastInputWasVoiceRef.current = true;
        handleSend(raw);
      }
    });
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
        // Rà soát lại 2026-07-27 (user báo "height" vẫn chưa "triệt để"): AndroidManifest.xml
        // của app đã khai `android:windowSoftInputMode="adjustResize"` - nghĩa là HỆ ĐIỀU HÀNH
        // tự co nhỏ cửa sổ app khi bàn phím mở, KHÔNG cần KeyboardAvoidingView làm việc đó lại
        // trên Android. Trước đây dùng `behavior="height"` CÙNG LÚC với `adjustResize` là tổ
        // hợp hay gây lỗi (RN tính lại height dựa theo sự kiện bàn phím, CHỒNG lên phần OS đã
        // tự co - dễ ra kết quả co 2 lần hoặc giật/lệch tuỳ loại bàn phím). Giờ FlatList bên
        // dưới đã có `style={{flex:1}}` (fix cùng đợt trước, xem mục layout chip gợi ý) - khi
        // OS co cửa sổ, FlatList tự co theo (flex:1 hấp thụ hết phần hụt), thanh nhập (không có
        // flex, đứng NGAY SAU FlatList) tự động trồi lên sát mép trên bàn phím mà KHÔNG cần
        // logic JS nào thêm - để Android tự lo trọn vẹn qua `adjustResize`, KHÔNG chồng thêm
        // `KeyboardAvoidingView` (behavior=undefined). iOS KHÔNG có cơ chế tương đương
        // `adjustResize` nên vẫn cần `padding` như cũ.
        // Lưu ý: đây là suy luận đúng theo tài liệu RN/Android (adjustResize + KeyboardAvoidingView
        // trên Android là tổ hợp không nên dùng chung) - CẦN test lại trên thiết bị thật để xác
        // nhận hết hẳn, môi trường này không có device/simulator để tự kiểm chứng bằng mắt.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={uiMessages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
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
            // flexGrow/flexShrink: 0 - chip gợi ý không được phép giãn ra chiếm khoảng trống còn
            // lại của layout (bug thật lúc test app build: thiếu khai báo này khiến hàng chip
            // giãn cao gần hết màn hình). alignItems:'flex-start' trên contentContainerStyle -
            // ScrollView ngang mặc định alignItems:'stretch' (kế thừa flexbox chuẩn), khiến MỌI
            // chip bị kéo cao bằng chiều cao khả dụng của ScrollView thay vì cao vừa đúng nội
            // dung chữ bên trong.
            style={{ flexGrow: 0, flexShrink: 0 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 8, alignItems: 'flex-start' }}
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

        {voiceStatus === 'listening' && (
          // Rà soát 2026-07-27 (góp ý user, kiểu Kiki): thay icon mic tĩnh bằng waveform sống
          // theo âm lượng thật (VoiceWaveform đọc useVoiceInput().volume) - không cần bấm gì
          // thêm, Nori tự dừng nghe khi bạn ngừng nói (hoặc sau tối đa 10s, xem MAX_LISTEN_MS ở
          // useVoiceInput.ts) rồi tự gửi câu hỏi, không cần bấm nút gửi.
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}>
            <VoiceWaveform volume={voiceVolume} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: 13 }}>Đang nghe... (tự gửi khi bạn dừng nói)</Text>
          </View>
        )}

        {isSpeaking && (
          <TouchableOpacity
            onPress={() => { Speech.stop(); setIsSpeaking(false); }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 }}
          >
            <FontAwesome5 name="volume-up" size={13} color={colors.primary} solid />
            <Text style={{ color: colors.primary }}>Nori đang nói... (bấm để dừng)</Text>
          </TouchableOpacity>
        )}

        {voiceError && voiceStatus === 'error' && (
          <Text style={{ color: colors.error, fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 }}>{voiceError}</Text>
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
            onPress={handleMicPress}
            disabled={isThinking}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: voiceStatus === 'listening' ? colors.error : colors.background,
              alignItems: 'center', justifyContent: 'center',
              opacity: isThinking ? 0.5 : 1,
            }}
          >
            <FontAwesome5 name="microphone" size={16} color={voiceStatus === 'listening' ? '#fff' : colors.textSecondary} solid />
          </TouchableOpacity>
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

      {/* Xác nhận trước khi ghi dữ liệu (Phase 2, mục 7: odometer.create/fuel.create là tool
          mutating) - ConversationManager đang await confirmAction() nên chỉ tiếp tục vòng lặp
          tool-call sau khi user bấm 1 trong 2 nút này. */}
      <Modal visible={!!pendingConfirmation} transparent animationType="fade" onRequestClose={() => resolveConfirmation(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 24 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '100%' }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 10 }}>
              Nori muốn ghi dữ liệu
            </Text>
            <Text style={{ color: colors.text, fontSize: 15, marginBottom: 20 }}>
              {pendingConfirmation?.summary}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => resolveConfirmation(false)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: colors.background }}
              >
                <Text style={{ color: colors.text }}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => resolveConfirmation(true)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Đồng ý</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
