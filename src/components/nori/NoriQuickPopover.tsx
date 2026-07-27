import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Pressable } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useColors } from '../../utils/theme';
import { useNoriAgentStore, PREMIUM_REQUIRED_TEXT } from '../../store/noriAgentStore';
import { useInitNoriAgent } from '../../agent/useInitNoriAgent';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import VoiceWaveform from './VoiceWaveform';
import { useAuthStore } from '../../store/authStore';
import { navigationRef } from '../../navigation/navigationRef';

interface NoriQuickPopoverProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Popup hỏi-đáp nhanh, nổi NGAY TẠI CHỖ (không rời màn hình hiện tại) - thêm 2026-07-27 theo
 * góp ý user: đã có giọng nói (Phase 3) rồi thì bấm icon Nori nổi bắt buộc chuyển hẳn sang 1
 * trang chat riêng (`NoriChatScreen`) là thừa, nên làm hiệu ứng "nói chuyện" ngay tại chỗ giống
 * trợ lý giọng nói thật hơn.
 *
 * Dùng CHUNG `useNoriAgentStore` với `NoriChatScreen` (qua `useInitNoriAgent`, no-op nếu agent
 * đã tồn tại) - hội thoại bắt đầu ở đây và mở rộng sang trang đầy đủ (hoặc ngược lại) vẫn liền
 * mạch, vì là CÙNG 1 transcript thật (mục 1: "transcript tool là nguồn sự thật").
 *
 * Cố tình CHỈ hiện tin nhắn CUỐI CÙNG (không phải toàn bộ lịch sử) - popup nhỏ, xem lại nhiều
 * lượt/chấm điểm/gõ câu hỏi mẫu vẫn cần trang đầy đủ (nút "Mở rộng").
 *
 * Nếu Nori cần xác nhận trước khi ghi dữ liệu (Phase 2: odometer.create/fuel.create) -
 * `pendingConfirmation` sẽ khác null - popup KHÔNG tự vẽ Modal xác nhận riêng (dễ bấm nhầm khi
 * đang thao tác ghi dữ liệu thật trong 1 popup nhỏ) mà tự động điều hướng sang `NoriChatScreen`
 * (đã có sẵn Modal xác nhận rõ ràng) rồi đóng popup lại.
 */
export default function NoriQuickPopover({ visible, onClose }: NoriQuickPopoverProps) {
  const colors = useColors();
  // Rà soát 2026-07-27 (fix crash thật, cùng nguyên nhân với NoriFloatingButton.tsx): KHÔNG
  // dùng useNavigation() - popup này (qua NoriFloatingButton) mount ngoài mọi Navigator, hook
  // đó ném "Couldn't find a 'navigation' object..." ngay khi render. Dùng navigationRef (đã
  // gắn vào <NavigationContainer ref={navigationRef}> ở App.tsx) thay thế, xem
  // NoriFloatingButton.tsx để biết chi tiết + log crash thật đã bắt được.
  useInitNoriAgent();
  const { uiMessages, isThinking, sendMessage, pendingConfirmation } = useNoriAgentStore();
  // Bắt buộc kiểm tra Premium TRƯỚC khi tự động mở mic (2026-07-27) - nếu không, user Free bị
  // xin quyền micro + nói xong xuôi mới biết cần Premium (trải nghiệm ngược, xin quyền micro
  // xâm phạm hơn hẳn 1 lời từ chối API thường - đã bắt được lúc rà soát lại code, không phải
  // suy đoán: gate thật nằm trong `sendMessage()` của store, CHỈ chặn lúc GỬI, không chặn lúc
  // MỞ popup/tự nghe).
  const isPremium = useAuthStore((s) => !!s.user?.is_premium);
  const [input, setInput] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const { listen, stop: stopListening, status: voiceStatus, error: voiceError, volume: voiceVolume } = useVoiceInput();
  const prevMessageCountRef = useRef(uiMessages.length);
  const lastMessage = uiMessages[uiMessages.length - 1];

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
      Speech.speak(lastMessage.text, {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'center', padding: 24 }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>Nori</Text>
            <TouchableOpacity onPress={handleExpand} hitSlop={10}>
              <FontAwesome5 name="expand-alt" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <FontAwesome5 name="times" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ minHeight: 60, justifyContent: 'center' }}>
            {!isPremium ? (
              <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{PREMIUM_REQUIRED_TEXT}</Text>
            ) : isThinking ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={{ color: colors.textSecondary }}>Nori đang kiểm tra...</Text>
              </View>
            ) : voiceStatus === 'listening' ? (
              // Rà soát 2026-07-27 (góp ý user, kiểu Kiki): waveform sống theo âm lượng thay icon
              // mic tĩnh - popup này đã tự nghe ngay khi mở (xem useEffect [visible, isPremium]
              // phía trên), không cần bấm gì thêm, tự dừng+gửi khi bạn ngừng nói.
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <VoiceWaveform volume={voiceVolume} color={colors.error} />
                <Text style={{ color: colors.error, fontSize: 13 }}>Đang nghe...</Text>
              </View>
            ) : lastMessage ? (
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{lastMessage.text}</Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Bạn muốn hỏi Nori điều gì?</Text>
            )}
          </View>

          {voiceError && voiceStatus === 'error' && (
            <Text style={{ color: colors.error, fontSize: 12 }}>{voiceError}</Text>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Hoặc gõ câu hỏi..."
              placeholderTextColor={colors.textSecondary}
              style={{
                flex: 1, backgroundColor: colors.background, borderRadius: 20,
                paddingHorizontal: 16, paddingVertical: 10, color: colors.text,
              }}
              onSubmitEditing={() => handleSend()}
              editable={!isThinking}
            />
            <TouchableOpacity
              onPress={handleMicPress}
              disabled={isThinking || !isPremium}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: voiceStatus === 'listening' ? colors.error : colors.background,
                alignItems: 'center', justifyContent: 'center', opacity: isThinking || !isPremium ? 0.5 : 1,
              }}
            >
              <FontAwesome5 name="microphone" size={16} color={voiceStatus === 'listening' ? '#fff' : colors.textSecondary} solid />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={isThinking || !input.trim()}
              style={{
                width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary,
                alignItems: 'center', justifyContent: 'center', opacity: isThinking || !input.trim() ? 0.5 : 1,
              }}
            >
              <FontAwesome5 name="paper-plane" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
