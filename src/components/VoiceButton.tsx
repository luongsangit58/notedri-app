import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, Animated, StyleSheet,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface VoiceButtonProps {
  /** Label shown on the button in idle state */
  label?: string;
  /** Hint text shown inside the recording overlay */
  hint?: string;
  /** Called with the parsed numeric string and raw transcript */
  onResult: (value: string, raw: string) => void;
  /** Small variant: renders a round icon button instead of full-width */
  compact?: boolean;
}

export default function VoiceButton({ label, hint, onResult, compact = false }: VoiceButtonProps) {
  const colors = useColors();
  const voice = useVoiceInput();
  const [feedback, setFeedback] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const feedbackOpacity = useRef(new Animated.Value(0)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Pulse animation while listening
  useEffect(() => {
    if (voice.status === 'listening') {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
    return () => { pulseLoop.current?.stop(); };
  }, [voice.status]);

  // Fade out feedback toast
  useEffect(() => {
    if (!feedback) return;
    feedbackOpacity.setValue(1);
    const t = setTimeout(() => {
      Animated.timing(feedbackOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
        .start(() => setFeedback(null));
    }, 1800);
    return () => clearTimeout(t);
  }, [feedback]);

  const handlePress = () => {
    if (voice.status === 'listening') {
      voice.stop();
      return;
    }
    voice.listen((value, raw) => {
      onResult(value, raw);
    });
  };

  const showFeedback = (msg: string) => setFeedback(msg);

  // Expose showFeedback so parent can call it after routing the value
  // (parent wraps onResult and calls VoiceButton.showFeedback)
  // This is done via the ref pattern - but simpler: parent just does its own toast.
  // We just handle the recording overlay here.

  const isListening = voice.status === 'listening';

  if (compact) {
    return (
      <View>
        <TouchableOpacity
          onPress={handlePress}
          style={[styles.compactBtn, { backgroundColor: isListening ? colors.primary : colors.surface }]}>
          <Animated.View style={{ transform: [{ scale: isListening ? pulseAnim : 1 }] }}>
            <FontAwesome5
              name={isListening ? 'stop-circle' : 'microphone'}
              size={16}
              color={isListening ? '#fff' : colors.primary}
              solid
            />
          </Animated.View>
        </TouchableOpacity>

        {/* Inline feedback under button */}
        {feedback && (
          <Animated.View style={{ opacity: feedbackOpacity, position: 'absolute', top: 48, right: 0, zIndex: 99 }}>
            <View style={[styles.feedbackBubble, { backgroundColor: colors.primary }]}>
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{feedback}</Text>
            </View>
          </Animated.View>
        )}

        {/* Error text */}
        {voice.error && voice.status !== 'listening' && (
          <Text style={{ color: '#F59000', fontSize: 11, marginTop: 4, textAlign: 'right' }}>{voice.error}</Text>
        )}
      </View>
    );
  }

  return (
    <View>
      {/* Recording overlay modal */}
      <Modal visible={isListening} transparent animationType="fade" onRequestClose={() => voice.stop()}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => voice.stop()}
          style={styles.overlay}>
          <View style={[styles.panel, { backgroundColor: colors.surface }]}>
            {/* Pulse rings */}
            <View style={styles.pulseContainer}>
              <Animated.View style={[
                styles.pulseRing,
                { borderColor: colors.primary, transform: [{ scale: pulseAnim }], opacity: 0.25 },
              ]} />
              <Animated.View style={[
                styles.pulseRing,
                { borderColor: colors.primary, transform: [{ scale: Animated.multiply(pulseAnim, 0.8) }], opacity: 0.45 },
              ]} />
              <View style={[styles.micCircle, { backgroundColor: colors.primary }]}>
                <FontAwesome5 name="microphone" size={28} color="#fff" solid />
              </View>
            </View>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 20 }}>
              Đang nghe...
            </Text>
            {hint && (
              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                {hint}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => voice.stop()}
              style={[styles.stopBtn, { backgroundColor: colors.background }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Tap để dừng</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Main button */}
      <TouchableOpacity
        onPress={handlePress}
        style={[styles.fullBtn, { backgroundColor: colors.surface }]}>
        <FontAwesome5 name="microphone" size={16} color={colors.primary} solid />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
          {label ?? 'Nhập bằng giọng nói'}
        </Text>
      </TouchableOpacity>

      {/* Feedback toast */}
      {feedback && (
        <Animated.View style={[styles.toast, { backgroundColor: '#16A34A', opacity: feedbackOpacity }]}>
          <FontAwesome5 name="check-circle" size={13} color="#fff" solid />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 6 }}>{feedback}</Text>
        </Animated.View>
      )}

      {/* Error */}
      {voice.error && voice.status !== 'listening' && (
        <Text style={{ color: '#F59000', fontSize: 12, marginTop: 6, textAlign: 'center' }}>{voice.error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fullBtn: {
    padding: 13,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  compactBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  panel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 32,
    alignItems: 'center',
    paddingBottom: 48,
  },
  pulseContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  micCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  feedbackBubble: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 120,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
});
