import { useState, useCallback } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

type Status = 'idle' | 'listening' | 'done' | 'error';

interface UseVoiceInputResult {
  listen: (onResult: (value: string) => void) => void;
  stop: () => void;
  status: Status;
  error: string | null;
}

function parseNumberFromSpeech(text: string): string {
  const decimal = text.match(/\d+[.,]\d+/);
  if (decimal) return decimal[0].replace(',', '.');
  const digits = text.replace(/\D/g, '');
  return digits;
}

export function useVoiceInput(): UseVoiceInputResult {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [callback, setCallback] = useState<((value: string) => void) | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    const raw = event.results[0]?.transcript ?? '';
    const parsed = parseNumberFromSpeech(raw);
    if (parsed && callback) callback(parsed);
    setStatus('idle');
  });

  useSpeechRecognitionEvent('end', () => {
    setStatus(s => s === 'listening' ? 'done' : s);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setStatus('error');
    setError(event.message ?? 'Không nhận dạng được giọng nói');
  });

  const listen = useCallback((onResult: (value: string) => void) => {
    setCallback(() => onResult);
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
