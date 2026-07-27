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
  // Bug thật bắt được lúc test app build (2026-07-27): với câu dài có khoảng dừng giữa các từ
  // ("tiền xăng... tháng... 6"), thiết bị Android đôi khi bắn NHIỀU sự kiện 'result' trong CÙNG
  // 1 phiên nghe (mỗi lần dừng ngắn coi như 1 "final" riêng) dù đã đặt `interimResults: false` -
  // trước đây gọi callback NGAY tại mỗi 'result' khiến parent (NoriChatScreen) gửi NHIỀU tin
  // nhắn rời rạc ("tiền", "tiền xăng", "tiền xăng tháng", "tiền xăng tháng 6"...) thay vì 1 câu
  // hoàn chỉnh - làm rối transcript và khiến LocalIntentMatcher/LLM hiểu sai ý (khớp nhầm câu
  // hỏi "tiền xăng" cụt trước khi user nói xong "tháng 6"). Giờ CHỈ lưu lại transcript MỚI NHẤT
  // trong lúc nghe, và CHỈ gọi callback 1 LẦN DUY NHẤT khi phiên nghe thật sự kết thúc ('end').
  const latestResultRef = useRef<{ parsed: string; raw: string } | null>(null);

  useSpeechRecognitionEvent('result', (event) => {
    const raw = event.results[0]?.transcript ?? '';
    const parsed = parseNumberFromSpeech(raw);
    latestResultRef.current = { parsed, raw };
  });

  useSpeechRecognitionEvent('end', () => {
    setStatus((s) => {
      if (s !== 'listening') return s;
      const result = latestResultRef.current;
      latestResultRef.current = null;
      // Luôn gọi callback dù parsed rỗng — để parent hiển thị lỗi thay vì im lặng.
      if (callbackRef.current && result) callbackRef.current(result.parsed, result.raw);
      return 'done';
    });
  });

  useSpeechRecognitionEvent('error', (event) => {
    // Bug thật bắt được lúc rà soát 2026-07-27 (sau khi NoriQuickPopover giữ 1 instance
    // useVoiceInput() sống XUYÊN SUỐT phiên app, không riêng lúc mở popup): sự kiện native của
    // expo-speech-recognition là TOÀN CỤC (1 module singleton, không scope theo instance JS nào
    // gọi start()) - handler 'end' đã có sẵn guard `s !== 'listening'` để chỉ phản ứng với phiên
    // nghe do CHÍNH instance gọi, nhưng handler 'error' này thì KHÔNG - nghĩa là 1 lỗi giọng nói
    // xảy ra ở màn hình HOÀN TOÀN KHÁC (vd "không nghe thấy gì" lúc nhập ODO thủ công) sẽ làm
    // MỌI instance useVoiceInput() đang mount (kể cả NoriQuickPopover đang ẩn) cũng bị đẩy sang
    // status 'error' - khiến lần sau mở popup Nori, điều kiện tự nghe (`voiceStatus === 'idle'`)
    // không còn đúng nữa, popup lặng lẽ KHÔNG tự nghe được, kèm hiện nhầm thông báo lỗi của 1
    // màn hình khác. Thêm guard giống hệt 'end' - chỉ áp dụng lỗi khi CHÍNH instance này đang
    // thật sự ở trạng thái 'listening'.
    setStatus((s) => {
      if (s !== 'listening') return s;

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
      return 'error';
    });
  });

  const listen = useCallback(async (onResult: (value: string, raw: string) => void) => {
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setStatus('error');
      setError(t('voice.error_permission'));
      return;
    }
    callbackRef.current = onResult;
    latestResultRef.current = null;
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
