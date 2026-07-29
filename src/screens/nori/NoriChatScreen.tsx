import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Modal, ScrollView,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardStickyView, KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '../../utils/theme';
import { prepareTextForSpeech } from '../../utils/text';
import { useNoriAgentStore } from '../../store/noriAgentStore';
import { useInitNoriAgent } from '../../agent/useInitNoriAgent';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { describeProgressStage } from '../../agent/progressText';
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
    uiMessages, isThinking, progressStage, sendMessage, submitFeedback, pendingConfirmation, resolveConfirmation,
  } = useNoriAgentStore();
  useInitNoriAgent();
  const [input, setInput] = useState('');
  const [feedbackRequestId, setFeedbackRequestId] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  // Cải thiện UX 2026-07-28 (góp ý user): chip gợi ý trước đây CHỈ hiện đúng 1 lần lúc mới mở
  // màn hình (uiMessages.length<=1) rồi biến mất vĩnh viễn - sau khi Nori có thêm tool mới
  // (lifetime cost, trạm sạc điện...) không còn cách nào để biết mà hỏi. Mặc định vẫn hiện lúc
  // mới mở (giữ hành vi cũ), nhưng giờ user có thể tự mở lại/đóng bất kỳ lúc nào qua nút gợi ý
  // ở thanh soạn tin (xem showSuggestions bên dưới).
  const [showSuggestions, setShowSuggestions] = useState(uiMessages.length <= 1);
  const listRef = useRef<FlatList>(null);

  const {
    listen, stop: stopListening, status: voiceStatus, error: voiceError, volume: voiceVolume, interimTranscript,
  } = useVoiceInput();
  const [isSpeaking, setIsSpeaking] = useState(false);
  // true nếu lượt hỏi VỪA RỒI là bằng giọng nói - chỉ đọc to trả lời trong trường hợp đó
  // (gõ chữ thì Nori không tự đọc, tránh gây phiền/ồn không mong muốn).
  const lastInputWasVoiceRef = useRef(false);
  const prevMessageCountRef = useRef(uiMessages.length);

  // Bàn phím mở che mất tin nhắn cuối (bug thật user báo): `KeyboardStickyView` bọc thanh nhập
  // chỉ TRANSLATE lên trên bàn phím bằng animation (transform), không đẩy layout - FlatList phía
  // trên vẫn giữ nguyên chiều cao cũ nên vùng bàn phím vừa che lên ĐÚNG phần cuối danh sách chat.
  // Dành thêm khoảng trống bằng đúng chiều cao bàn phím ở đáy FlatList để nội dung không bao giờ
  // bị che, và cuộn lại xuống cuối mỗi khi bàn phím đổi trạng thái hoặc các dòng chỉ báo
  // (đang nghĩ/đang nghe/đang nói) xuất hiện/biến mất - những thay đổi này KHÔNG đổi số lượng tin
  // nhắn nên `onContentSizeChange` (dựa vào kích thước NỘI DUNG) không tự bắt được.
  const keyboardHeight = useKeyboardState((s) => s.height);
  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
    // KHÔNG thêm `interimTranscript` vào deps dù dòng chữ sống này cũng nằm trong
    // KeyboardStickyView - nó đổi liên tục (gần như mỗi 100ms lúc đang nói), cuộn lại mỗi lần sẽ
    // giật/phiền hơn là hữu ích. `voiceStatus` đã đủ để cuộn đúng lúc dòng này xuất hiện/biến mất.
  }, [keyboardHeight, isThinking, voiceStatus, isSpeaking, voiceError]);

  useEffect(() => {
    const newMessage = uiMessages[uiMessages.length - 1];
    const hasNewMessage = uiMessages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = uiMessages.length;

    if (hasNewMessage && newMessage?.role === 'assistant' && lastInputWasVoiceRef.current) {
      lastInputWasVoiceRef.current = false;
      const text = prepareTextForSpeech(newMessage.text);
      // Rà soát (user báo trên đầu Android ô tô: đôi lúc câu trả lời đã in ra chat nhưng Nori
      // không đọc) - gọi Speech.speak() NGAY trong effect chạy liền sau set() render lại (câu trả
      // lời vừa in ra + isThinking vừa tắt) đụng đúng cùng 1 lớp bug đã gặp ở nơi khác trong app:
      // "chạm native bridge lúc app đang bận" bị vài ROM đầu Android ô tô âm thầm rớt lệnh thay vì
      // báo lỗi (xem lý do tương tự ở authStore.ts login() trước khi xin quyền thông báo). Đợi
      // hết đợt tương tác/animation hiện tại bằng runAfterInteractions() trước khi gọi, cùng cách
      // đã áp dụng ở đó. Cũng chủ động Speech.stop() trước - phòng 1 utterance cũ coi như "đã
      // xong" phía JS nhưng engine TTS native còn chưa nhả xong, khiến utterance mới bị nuốt im
      // lặng trên vài engine TTS OEM.
      InteractionManager.runAfterInteractions(async () => {
        await Speech.stop().catch(() => {});
        Speech.speak(text, {
          language: 'vi-VN',
          onStart: () => setIsSpeaking(true),
          onDone: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
          onError: (error) => {
            console.warn('[NoriAgent] Speech.speak() lỗi, Nori không đọc được câu trả lời:', error);
            setIsSpeaking(false);
          },
        });
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
      {/* Rà soát 2026-07-28 (user báo bàn phím VẪN che input dù đã dựa vào `adjustResize` -
          fix trước KHÔNG đủ triệt để trên thiết bị thật): thay hẳn bằng
          `react-native-keyboard-controller` (thư viện Expo hiện khuyến nghị cho đúng use-case
          "danh sách + thanh nhập ghim đáy") thay vì tiếp tục vá `KeyboardAvoidingView` thuần
          react-native (đã thử cả `height` lẫn dựa vào `adjustResize`, cả 2 đều không triệt để
          trên thực tế thiết bị). `KeyboardStickyView` (bọc composer bên dưới) tự trồi lên đúng
          sát mép bàn phím bằng animation native, không cần tính toán height thủ công - FlatList
          ở NGOÀI, không cần bọc gì thêm, chỉ cần `flex:1` như cũ. */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={uiMessages}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 + keyboardHeight, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
              Hỏi Nori về tình trạng xe, chi phí, hoặc lịch bảo dưỡng nhé.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={{ alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <View
                style={{
                  backgroundColor: item.role === 'user' ? colors.primary : colors.surface,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                }}
              >
                <Text style={{ color: item.role === 'user' ? '#fff' : colors.text }}>{item.text}</Text>
              </View>
              {/* Chấm điểm hiện RÕ bằng 2 icon (cải thiện UX 2026-07-28, góp ý user: trước đây
                  phải nhấn giữ - 1 thao tác ẩn gần như không ai tự tìm ra). 👍 chấm ngay "đúng"
                  không cần thêm bước; 👎 mở modal chi tiết (chọn sai/1 phần đúng + ghi chú) vì
                  câu trả lời sai đáng để hỏi thêm lý do hơn câu đúng. */}
              {item.role === 'assistant' && item.requestId && (
                item.feedbackRating ? (
                  <Text style={{ marginTop: 4, marginLeft: 4, fontSize: 12, color: colors.textSecondary }}>
                    {RATING_OPTIONS.find((r) => r.value === item.feedbackRating)?.emoji} Đã chấm điểm
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 14, marginTop: 4, marginLeft: 4 }}>
                    <TouchableOpacity onPress={() => submitFeedback(item.requestId!, 'good')} hitSlop={8}>
                      <FontAwesome5 name="thumbs-up" size={13} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openFeedback(item.requestId)} hitSlop={8}>
                      <FontAwesome5 name="thumbs-down" size={13} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                )
              )}
            </View>
          )}
        />

        {showSuggestions && !isThinking && (
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
                onPress={() => {
                  // Đóng gợi ý lại sau khi dùng - user vừa "dùng xong" 1 gợi ý, không cần chiếm
                  // chỗ nữa, nhưng vẫn mở lại được bất kỳ lúc nào qua nút bóng đèn ở thanh soạn.
                  setShowSuggestions(false);
                  handleSend(q);
                }}
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
      </View>

      <KeyboardStickyView>
        {isThinking && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.textSecondary }}>{describeProgressStage(progressStage)}</Text>
          </View>
        )}

        {voiceStatus === 'listening' && (
          // Rà soát 2026-07-27 (góp ý user, kiểu Kiki): thay icon mic tĩnh bằng waveform sống
          // theo âm lượng thật (VoiceWaveform đọc useVoiceInput().volume) - không cần bấm gì
          // thêm, Nori tự dừng nghe khi bạn ngừng nói (hoặc sau tối đa 10s, xem MAX_LISTEN_MS ở
          // useVoiceInput.ts) rồi tự gửi câu hỏi, không cần bấm nút gửi.
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 10 }}>
            <VoiceWaveform volume={voiceVolume} color={colors.error} />
            {/* Chữ hiện dần như đang chat (góp ý user: đang nói muốn biết Nori có nghe đúng
                không thay vì chỉ có waveform + dòng chữ tĩnh) - `interimTranscript` cập nhật
                sống theo từng kết quả tạm, KHÔNG phải nguồn dữ liệu gửi đi (xem useVoiceInput.ts:
                đường gửi vẫn chỉ chốt 1 lần lúc dừng nghe). Chưa có chữ nào -> vẫn hiện dòng gợi
                ý cũ, tránh khoảng trắng trống lúc vừa bấm mic. */}
            <Text style={{ color: colors.error, fontSize: 13, flex: 1 }} numberOfLines={2}>
              {interimTranscript || 'Đang nghe... (tự gửi khi bạn dừng nói)'}
            </Text>
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
          {/* Mở lại chip gợi ý bất kỳ lúc nào (cải thiện UX 2026-07-28) - trước đây gợi ý chỉ
              hiện đúng 1 lần lúc mới mở màn hình rồi biến mất vĩnh viễn, không còn cách nào để
              khám phá tool mới thêm sau này (vd tổng chi phí trọn đời, trạm sạc điện...). */}
          <TouchableOpacity
            onPress={() => setShowSuggestions((s) => !s)}
            style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: showSuggestions ? colors.primary : colors.background,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <FontAwesome5 name="lightbulb" size={16} color={showSuggestions ? '#fff' : colors.textSecondary} solid={showSuggestions} />
          </TouchableOpacity>
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
      </KeyboardStickyView>

      <Modal visible={!!feedbackRequestId} transparent animationType="slide" onRequestClose={() => setFeedbackRequestId(null)}>
        {/* Cùng đợt rà soát 2026-07-28 (sheet ghim đáy, behavior 'height' trên Android - cùng
            tổ hợp không đáng tin đã sửa cho khối chat chính phía trên) - đổi sang
            KeyboardAvoidingView của react-native-keyboard-controller, "padding" cho cả 2 nền. */}
        <KeyboardAvoidingView
          behavior="padding"
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
          tool-call sau khi user bấm 1 trong 2 nút này.
          Đổi sang bottom sheet (cải thiện UX 2026-07-28, góp ý user) - đây là dialog CĂN GIỮA
          DUY NHẤT còn sót lại trong Nori, lệch hẳn ngôn ngữ bottom-sheet đã dùng ở feedback
          modal ngay phía trên và NoriQuickPopover - đổi cho đồng bộ toàn bộ trải nghiệm Nori. */}
      <Modal visible={!!pendingConfirmation} transparent animationType="slide" onRequestClose={() => resolveConfirmation(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
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
