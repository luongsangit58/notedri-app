import { useState, useCallback, useRef } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useT } from '../i18n';

type Status = 'idle' | 'listening' | 'done' | 'error';

interface UseVoiceInputResult {
  listen: (onResult: (value: string, raw: string) => void) => Promise<void>;
  stop: () => void;
  status: Status;
  error: string | null;
}

// Bộ số nhân tiếng Việt thường xuất hiện trong Google STT transcript.
// Google STT hay trả "1 triệu", "500 nghìn", "1,5 triệu" thay vì "1000000".
const VI_MULS: Array<[string, number]> = [
  ['tỷ',    1_000_000_000],
  ['triệu', 1_000_000],
  ['trieu', 1_000_000],
  ['nghìn', 1_000],
  ['ngàn',  1_000],
  ['ngan',  1_000],
  ['nghin', 1_000],
  ['trăm',  100],
  ['tram',  100],
];

export function parseNumberFromSpeech(text: string): string {
  const t = text.trim();

  // 1) "500 nghìn", "1 triệu", "1.5 triệu", "1,5 triệu"
  //    digit (+ optional 1-decimal) + space + multiplier word
  for (const [word, mul] of VI_MULS) {
    const m = t.match(new RegExp(`([0-9]+(?:[.,][0-9]+)?)\\s*${word}`, 'i'));
    if (m) {
      const base = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(base)) return String(Math.round(base * mul));
    }
  }

  // 2) Vietnamese thousands format: "1.000.000", "100.000", "20.000"
  //    Nhận ra bởi nhóm ĐÚNG 3 chữ số sau dấu chấm (phân biệt với "20.5" là lít).
  const vnd = t.match(/\d{1,3}(?:\.\d{3})+/);
  if (vnd) {
    return vnd[0].replace(/\./g, '');
  }

  // 3) Số thực sự có thập phân (≤2 chữ số thập phân): "20.5", "20,5" — thường là lít
  const dec = t.match(/(\d+)[.,](\d{1,2})(?!\d)/);
  if (dec) {
    return `${dec[1]}.${dec[2]}`;
  }

  // 4) Fallback: chỉ lấy chữ số
  return t.replace(/\D/g, '');
}

export function useVoiceInput(): UseVoiceInputResult {
  const t = useT();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  // Bug fix: use ref instead of state so event handlers always see the latest callback
  // (state captured in useSpeechRecognitionEvent closure would be stale after first render)
  const callbackRef = useRef<((value: string, raw: string) => void) | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    const raw = event.results[0]?.transcript ?? '';
    const parsed = parseNumberFromSpeech(raw);
    // Luôn gọi callback dù parsed rỗng — để parent hiển thị lỗi thay vì im lặng
    if (callbackRef.current) callbackRef.current(parsed, raw);
    setStatus('idle');
  });

  useSpeechRecognitionEvent('end', () => {
    setStatus(s => s === 'listening' ? 'done' : s);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setStatus('error');
    const code = ((event as any).error ?? '').toLowerCase();
    const msg = (event.message ?? '').toLowerCase();
    let viMsg: string;
    if (code === 'no-speech' || msg.includes('no speech') || msg.includes('no_speech')) {
      viMsg = t('voice.error_no_speech');
    } else if (code === 'not-allowed' || code === 'service-not-allowed' || msg.includes('permission') || msg.includes('not_allowed')) {
      viMsg = t('voice.error_permission');
    } else if (code === 'network' || msg.includes('network')) {
      viMsg = t('voice.error_network');
    } else if (code === 'audio-capture' || msg.includes('audio')) {
      viMsg = t('voice.error_audio');
    } else if (code === 'aborted' || msg.includes('aborted')) {
      viMsg = t('voice.error_aborted');
    } else {
      viMsg = t('voice.error_unknown');
    }
    setError(viMsg);
  });

  const listen = useCallback(async (onResult: (value: string, raw: string) => void) => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setStatus('error');
      setError(t('voice.error_permission'));
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
