import { useState, useCallback, useRef } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

type Status = 'idle' | 'listening' | 'done' | 'error';

interface UseVoiceInputResult {
  listen: (onResult: (value: string, raw: string) => void) => Promise<void>;
  stop: () => void;
  status: Status;
  error: string | null;
}

export function parseNumberFromSpeech(text: string): string {
  const decimal = text.match(/\d+[.,]\d+/);
  if (decimal) return decimal[0].replace(',', '.');
  const digits = text.replace(/\D/g, '');
  return digits;
}

export function useVoiceInput(): UseVoiceInputResult {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  // Bug fix: use ref instead of state so event handlers always see the latest callback
  // (state captured in useSpeechRecognitionEvent closure would be stale after first render)
  const callbackRef = useRef<((value: string, raw: string) => void) | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    const raw = event.results[0]?.transcript ?? '';
    const parsed = parseNumberFromSpeech(raw);
    if (parsed && callbackRef.current) callbackRef.current(parsed, raw);
    setStatus('idle');
  });

  useSpeechRecognitionEvent('end', () => {
    setStatus(s => s === 'listening' ? 'done' : s);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setStatus('error');
    setError(event.message ?? 'Không nhận dạng được giọng nói');
  });

  const listen = useCallback(async (onResult: (value: string, raw: string) => void) => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setStatus('error');
      setError('Cần cấp quyền micro để dùng tính năng này');
      return;
    }
    callbackRef.current = onResult;
    setError(null);
    setStatus('listening');
    ExpoSpeechRecognitionModule.start({
      lang: 'vi-VN',
      interimResults: false,
      maxAlternatives: 1,
    });
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
    setStatus('idle');
  }, []);

  return { listen, stop, status, error };
}
