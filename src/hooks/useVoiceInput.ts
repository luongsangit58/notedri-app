import { useState, useEffect, useCallback } from 'react';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';

type Status = 'idle' | 'listening' | 'done' | 'error';

interface UseVoiceInputResult {
  listen: (onResult: (value: string) => void) => void;
  stop: () => void;
  status: Status;
  error: string | null;
}

// Extract a numeric string from raw speech (handles both integers and decimals)
function parseNumberFromSpeech(text: string): string {
  // First try: decimal number like "12.5" or "12,5"
  const decimal = text.match(/\d+[.,]\d+/);
  if (decimal) return decimal[0].replace(',', '.');

  // Second try: all digit chars joined (for integers like "85 320" → "85320")
  const digits = text.replace(/\D/g, '');
  return digits;
}

export function useVoiceInput(): UseVoiceInputResult {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [callback, setCallback] = useState<((value: string) => void) | null>(null);

  useEffect(() => {
    Voice.onSpeechEnd = () => setStatus(s => s === 'listening' ? 'done' : s);
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setStatus('error');
      setError(e.error?.message ?? 'Không nhận dạng được giọng nói');
    };
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const raw = e.value?.[0] ?? '';
      const parsed = parseNumberFromSpeech(raw);
      if (parsed && callback) callback(parsed);
      setStatus('idle');
    };

    return () => {
      Voice.onSpeechEnd = () => {};
      Voice.onSpeechError = () => {};
      Voice.onSpeechResults = () => {};
      Voice.destroy().catch(() => {});
    };
  }, [callback]);

  const listen = useCallback((onResult: (value: string) => void) => {
    setCallback(() => onResult);
    setError(null);
    setStatus('listening');
    Voice.start('vi-VN').catch(() => {
      // Fallback to device default locale
      Voice.start('').catch(() => {
        setStatus('error');
        setError('Thiết bị không hỗ trợ nhận dạng giọng nói');
      });
    });
  }, []);

  const stop = useCallback(() => {
    Voice.stop().catch(() => {});
    setStatus('idle');
  }, []);

  return { listen, stop, status, error };
}
