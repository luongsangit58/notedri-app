import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '../../utils/theme';
import { prepareTextForSpeech } from '../../utils/text';
import { useNoriAgentStore, PREMIUM_REQUIRED_TEXT } from '../../store/noriAgentStore';
import { useInitNoriAgent } from '../../agent/useInitNoriAgent';
import { describeProgressStage } from '../../agent/progressText';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useNoriSummary } from '../../services/nori/noriSummary';
import VoiceWaveform from './VoiceWaveform';
import NoriAvatar from './NoriAvatar';
import { useAuthStore } from '../../store/authStore';
import { navigationRef } from '../../navigation/navigationRef';

interface NoriQuickPopoverProps {
  visible: boolean;
  onClose: () => void;
  vehicleId?: number;
}

/**
 * Popup hỏi-đáp nhanh, nổi NGAY TẠI CHỖ (không rời màn hình hiện tại) - thêm 2026-07-27 theo
 * góp ý user: đã có giọng nói (Phase 3) rồi thì bấm icon Nori nổi bắt buộc chuyển hẳn sang 1
 * trang chat riêng (`NoriChatScreen`) là thừa, nên làm hiệu ứng "nói chuyện" ngay tại chỗ giống
 * trợ lý giọng nói thật hơn.
 *
 * Rà soát lại giao diện 2026-07-28 (góp ý user: hộp thoại CĂN GIỮA trông chưa chuyên nghiệp) -
 * đổi sang dạng BOTTOM SHEET (trượt lên từ đáy, góc trên bo tròn) giống đúng ngôn ngữ thiết kế
 * `NoriPopover` cũ (đã xoá) và các sheet khác trong app (OcrCamera, modal xoá tài khoản) - quen
 * thuộc hơn nhiều so với hộp thoại "alert" căn giữa cho 1 tương tác dạng trợ lý giọng nói. Dùng
 * lại `NoriAvatar` (linh vật có sẵn, đổi màu theo mood xe) thay icon chữ "Nori" trần - tạo liên
 * kết thị giác với icon nổi vừa bấm. Vì sheet này có TextInput ở đáy, bọc sẵn
 * `KeyboardAvoidingView` của react-native-keyboard-controller (behavior="padding") - tránh lặp
 * lại đúng lớp bug bàn phím che input vừa sửa ở nơi khác trong app, dù gõ chữ chỉ là lối phụ ở
 * đây (nói vẫn là chính).
 *
 * Dùng CHUNG `useNoriAgentStore` với `NoriChatScreen` (qua `useInitNoriAgent`, no-op nếu agent
 * đã tồn tại) - hội thoại bắt đầu ở đây và mở rộng sang trang đầy đủ (hoặc ngược lại) vẫn liền
 * mạch, vì là CÙNG 1 transcript thật (mục 1: "transcript tool là nguồn sự thật").
 *
 * Cố tình CHỈ hiện tin nhắn CUỐI CÙNG (không phải toàn bộ lịch sử) - popup nhỏ, xem lại nhiều
 * lượt/chấm điểm/gõ câu hỏi mẫu vẫn cần trang đầy đủ (nút "Mở rộng cuộc trò chuyện").
 *
 * Nếu Nori cần xác nhận trước khi ghi dữ liệu (Phase 2: odometer.create/fuel.create) -
 * `pendingConfirmation` sẽ khác null - popup KHÔNG tự vẽ Modal xác nhận riêng (dễ bấm nhầm khi
 * đang thao tác ghi dữ liệu thật trong 1 popup nhỏ) mà tự động điều hướng sang `NoriChatScreen`
 * (đã có sẵn Modal xác nhận rõ ràng) rồi đóng popup lại.
 */
export default function NoriQuickPopover({ visible, onClose, vehicleId }: NoriQuickPopoverProps) {
  const colors = useColors();
  // KHÔNG dùng useNavigation() - popup này (qua NoriFloatingButton) mount ngoài mọi Navigator,
  // hook đó ném "Couldn't find a 'navigation' object..." ngay khi render. Dùng navigationRef
  // (đã gắn vào <NavigationContainer ref={navigationRef}> ở App.tsx) thay thế.
  useInitNoriAgent();
  const { uiMessages, isThinking, progressStage, sendMessage, pendingConfirmation } = useNoriAgentStore();
  // Cùng nguồn mood với icon nổi vừa bấm (NoriFloatingButton) - avatar trong popup đổi màu
  // NHẤT QUÁN với icon đã bấm, không phải 2 chỉ báo tình trạng xe lệch nhau.
  const { mood } = useNoriSummary(vehicleId);
  // Bắt buộc kiểm tra Premium TRƯỚC khi tự động mở mic (2026-07-27) - nếu không, user Free bị
  // xin quyền micro + nói xong xuôi mới biết cần Premium (trải nghiệm ngược, xin quyền micro
  // xâm phạm hơn hẳn 1 lời từ chối API thường - đã bắt được lúc rà soát lại code, không phải
  // suy đoán: gate thật nằm trong `sendMessage()` của store, CHỈ chặn lúc GỬI, không chặn lúc
  // MỞ popup/tự nghe).
  const isPremium = useAuthStore((s) => !!s.user?.is_premium);
  const [input, setInput] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const {
    listen, stop: stopListening, status: voiceStatus, error: voiceError, volume: voiceVolume, interimTranscript,
  } = useVoiceInput();
  const prevMessageCountRef = useRef(uiMessages.length);
  const rawLastMessage = uiMessages[uiMessages.length - 1];
  // Rà soát 2026-07-28: CHỈ coi là "câu trả lời để hiện" khi lượt cuối là của Nori (assistant) -
  // trước đây lấy nguyên lastMessage bất kể vai trò, nên ngay sau khi user gửi câu hỏi (tin
  // nhắn USER vừa được đẩy vào uiMessages) nhưng TRƯỚC KHI isThinking kịp bật lên true, ô giữa
  // có thể thoáng hiện chính câu hỏi của user như thể là câu trả lời của Nori. Bug nhẹ (thường
  // gộp cùng 1 frame nhờ React batch nhiều set() liên tiếp nên khó thấy bằng mắt), nhưng lọc
  // đúng vai trò vẫn đúng-về-mặt-logic hơn hẳn, không tốn thêm chi phí gì.
  const lastMessage = rawLastMessage?.role === 'assistant' ? rawLastMessage : undefined;

  // Chuyển động mượt hơn giữa các trạng thái (cải thiện UX 2026-07-28, góp ý user: trước đây
  // đổi trạng thái - đang nghe/đang nghĩ/trả lời - là ĐỔI CHỮ TỨC THÌ, cảm giác "giật", không
  // giống 1 trợ lý đang "sống". `displayKey` đại diện đúng 1 khối nội dung đang hiện trong ô
  // giữa (mục dưới) - đổi key -> fade nhẹ, KHÔNG đổi key (vd nghe xong tự set lại status khác
  // nhưng vẫn cùng khối hiển thị) -> không animate lại, tránh nháy vô ích.
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const displayKey = !isPremium
    ? 'premium'
    : isThinking ? 'thinking'
    : voiceStatus === 'listening' ? 'listening'
    : lastMessage ? `message-${lastMessage.id}`
    : 'empty';
  const prevDisplayKeyRef = useRef(displayKey);
  useEffect(() => {
    if (prevDisplayKeyRef.current !== displayKey) {
      prevDisplayKeyRef.current = displayKey;
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [displayKey, contentOpacity]);

  const handleSend = (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text) return;
    setInput('');
    sendMessage(text);
  };

  const handleMicPress = async () => {
    if (!isPremium) return; // Free: mic không làm gì - tránh xin quyền micro cho tính năng chưa dùng được.
    if (isSpeaking) {
      await Speech.stop();
      setIsSpeaking(false);
    }
    if (voiceStatus === 'listening') {
      stopListening();
      return;
    }
    await listen((_parsed, raw) => {
      if (raw.trim()) handleSend(raw);
    });
  };

  // Popup này CHỈ mở khi user chủ động bấm icon để "nói chuyện" - khác NoriChatScreen (nơi gõ
  // chữ cũng phổ biến ngang giọng nói), ở đây LUÔN đọc to câu trả lời bất kể gõ hay nói, đúng
  // tinh thần "trợ lý giọng nói" mà popup này hướng tới.
  useEffect(() => {
    const hasNewMessage = uiMessages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = uiMessages.length;
    if (visible && hasNewMessage && lastMessage?.role === 'assistant') {
      Speech.speak(prepareTextForSpeech(lastMessage.text), {
        language: 'vi-VN',
        onStart: () => setIsSpeaking(true),
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  }, [uiMessages, visible, lastMessage]);

  // User Free: đọc to lời nhắc nâng cấp NGAY khi mở popup (không qua uiMessages/sendMessage() -
  // đây chỉ là thông báo tại chỗ, không phải 1 lượt hội thoại thật) - nhất quán với tinh thần
  // "popup này luôn đọc to" dù không tự nghe được (xem handleMicPress/useEffect [visible, isPremium]).
  useEffect(() => {
    if (visible && !isPremium) {
      Speech.speak(PREMIUM_REQUIRED_TEXT, { language: 'vi-VN' });
    }
  }, [visible, isPremium]);

  // Bấm icon -> tự nghe ngay (đúng mental model "trợ lý giọng nói": bấm phát là nói được luôn,
  // không cần thêm 1 lượt bấm mic nữa). Chỉ tự nghe khi popup vừa mở VÀ chưa có tin nhắn nào
  // đang chờ xử lý - tránh tự nghe chồng lên lúc Nori đang trả lời dở.
  useEffect(() => {
    if (visible && isPremium && voiceStatus === 'idle' && !isThinking) {
      listen((_parsed, raw) => {
        if (raw.trim()) handleSend(raw);
      });
    } else if (!visible) {
      // Đóng popup lúc đang nghe dở - dừng luôn, không để phiên STT treo lơ lửng sau khi UI
      // đã biến mất.
      stopListening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isPremium]);

  // Cần xác nhận trước khi ghi dữ liệu (Phase 2) - chuyển hẳn sang trang đầy đủ, không cố vẽ
  // Modal xác nhận trong popup nhỏ này.
  useEffect(() => {
    if (visible && pendingConfirmation) {
      onClose();
      if (navigationRef.isReady()) navigationRef.navigate('NoriChat' as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConfirmation, visible]);

  useEffect(() => {
    if (!visible) Speech.stop();
  }, [visible]);

  const handleExpand = () => {
    onClose();
    if (navigationRef.isReady()) navigationRef.navigate('NoriChat' as never);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 8,
              paddingHorizontal: 20,
              paddingBottom: 24,
              gap: 16,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: -4 },
              elevation: 12,
            }}
          >
            {/* Tay cầm kéo (thuần trang trí, gợi ý "đây là sheet có thể vuốt xuống để đóng" -
                giống ngôn ngữ bottom sheet quen thuộc, dù bấm ra ngoài mới thực sự đóng). */}
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <NoriAvatar mood={mood} size={40} />
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, flex: 1 }}>Nori</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
                <FontAwesome5 name="times" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Animated.View style={{ minHeight: 64, justifyContent: 'center', opacity: contentOpacity }}>
              {!isPremium ? (
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{PREMIUM_REQUIRED_TEXT}</Text>
              ) : isThinking ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{describeProgressStage(progressStage)}</Text>
                </View>
              ) : voiceStatus === 'listening' ? (
                // Waveform sống theo âm lượng thay icon mic tĩnh - popup này đã tự nghe ngay khi
                // mở (xem useEffect [visible, isPremium] phía trên), không cần bấm gì thêm, tự
                // dừng+gửi khi bạn ngừng nói.
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <VoiceWaveform volume={voiceVolume} color={colors.error} />
                  {/* Chữ hiện dần như đang chat (góp ý user, đồng bộ với NoriChatScreen.tsx) -
                      xem useVoiceInput.ts: chỉ để hiển thị, không phải nguồn dữ liệu gửi đi. */}
                  <Text style={{ color: colors.error, fontSize: 15, flex: 1 }} numberOfLines={2}>
                    {interimTranscript || 'Đang nghe...'}
                  </Text>
                </View>
              ) : lastMessage ? (
                <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22 }}>{lastMessage.text}</Text>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Bạn muốn hỏi Nori điều gì?</Text>
              )}
            </Animated.View>

            {voiceError && voiceStatus === 'error' && (
              <Text style={{ color: colors.error, fontSize: 12, marginTop: -8 }}>{voiceError}</Text>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.background,
                borderRadius: 26,
                padding: 6,
              }}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Hoặc gõ câu hỏi..."
                placeholderTextColor={colors.textSecondary}
                style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, fontSize: 15 }}
                onSubmitEditing={() => handleSend()}
                editable={!isThinking}
              />
              <TouchableOpacity
                onPress={handleMicPress}
                disabled={isThinking || !isPremium}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: voiceStatus === 'listening' ? colors.error : colors.surface,
                  alignItems: 'center', justifyContent: 'center', opacity: isThinking || !isPremium ? 0.5 : 1,
                }}
              >
                <FontAwesome5 name="microphone" size={15} color={voiceStatus === 'listening' ? '#fff' : colors.textSecondary} solid />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSend()}
                disabled={isThinking || !input.trim()}
                style={{
                  width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
                  alignItems: 'center', justifyContent: 'center', opacity: isThinking || !input.trim() ? 0.5 : 1,
                }}
              >
                <FontAwesome5 name="paper-plane" size={15} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleExpand} style={{ alignItems: 'center', paddingVertical: 4 }}>
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '600' }}>
                Mở rộng cuộc trò chuyện <FontAwesome5 name="arrow-right" size={11} />
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
