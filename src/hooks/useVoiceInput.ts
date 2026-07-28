import { useState, useCallback, useRef, useEffect } from 'react';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as Haptics from 'expo-haptics';
import { useT } from '../i18n';

type Status = 'idle' | 'listening' | 'done' | 'error';

interface UseVoiceInputResult {
  listen: (onResult: (value: string, raw: string) => void) => Promise<void>;
  stop: () => void;
  status: Status;
  error: string | null;
  /** Rà soát 2026-07-27 (góp ý user: muốn hiệu ứng "sóng sánh" thay cho nút bấm tĩnh) - cường độ
   * âm lượng hiện tại, chuẩn hoá về 0..1, chỉ khác 0 lúc đang nghe. Dùng để vẽ waveform sống theo
   * giọng nói thật (native trả về qua sự kiện `volumechange` của expo-speech-recognition, range
   * gốc -2..10 - xem ExpoSpeechRecognitionModule.types.d.ts). 0 khi không nghe. */
  volume: number;
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

// Rà soát 2026-07-27 (góp ý user, kiểu Kiki): không bắt user tự bấm dừng - nghe tối đa ngần này
// rồi TỰ dừng (native tự dừng sớm hơn nếu phát hiện im lặng sau khi nói xong - đây chỉ là giới
// hạn AN TOÀN, tránh treo "Đang nghe..." vô thời hạn nếu recognizer của 1 ROM/thiết bị nào đó
// không tự kết thúc phiên).
const MAX_LISTEN_MS = 10_000;

export function useVoiceInput(): UseVoiceInputResult {
  const t = useT();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);
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
  const maxListenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lưới an toàn cho stop() thủ công (bên dưới) - phòng trường hợp hiếm gặp 1 ROM/thiết bị nào
  // đó gọi native stop() xong không bao giờ bắn sự kiện 'end' (lẽ ra luôn phải bắn theo hợp đồng
  // của SpeechRecognizer, nhưng OEM tự chế không phải lúc nào cũng tuân thủ đúng) - nếu không có
  // lưới này, status sẽ kẹt mãi ở 'listening', còn TỆ HƠN bug gốc (ít nhất bug gốc còn về được
  // 'idle', chỉ là mất kết quả).
  const stopFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMaxListenTimer = () => {
    if (maxListenTimerRef.current) {
      clearTimeout(maxListenTimerRef.current);
      maxListenTimerRef.current = null;
    }
  };
  const clearStopFallbackTimer = () => {
    if (stopFallbackTimerRef.current) {
      clearTimeout(stopFallbackTimerRef.current);
      stopFallbackTimerRef.current = null;
    }
  };

  // Dùng chung cho cả sự kiện 'end' thật LẪN lưới an toàn của stop() - tránh lặp logic đóng phiên
  // nghe (chốt volume=0, gọi callback với kết quả gần nhất, chuyển status).
  const finishListening = useCallback(() => {
    clearMaxListenTimer();
    clearStopFallbackTimer();
    setVolume(0);
    setStatus((s) => {
      if (s !== 'listening') return s;
      const result = latestResultRef.current;
      latestResultRef.current = null;
      // Luôn gọi callback dù parsed rỗng — để parent hiển thị lỗi thay vì im lặng.
      if (callbackRef.current && result) callbackRef.current(result.parsed, result.raw);
      return 'done';
    });
  }, []);

  useSpeechRecognitionEvent('result', (event) => {
    const raw = event.results[0]?.transcript ?? '';
    const parsed = parseNumberFromSpeech(raw);
    latestResultRef.current = { parsed, raw };
  });

  // Rà soát 2026-07-27 (bug thật bắt qua feedback user: bấm mic lần 2 để "dừng" xong không thấy
  // gửi gì cả) - guard `s !== 'listening'` bên trong finishListening() ĐÚNG như thiết kế ban đầu,
  // nhưng trước đây `stop()` (bên dưới) tự set status='idle' NGAY LẬP TỨC (đồng bộ) trước khi sự
  // kiện 'end' này (mang transcript thật) kịp tới - nên tới lúc 'end' chạy, guard đã thấy status
  // là 'idle' chứ không còn 'listening' nữa, ÂM THẦM BỎ QUA kết quả vừa nói, callback không bao
  // giờ được gọi. Fix tận gốc ở `stop()` (không set 'idle' sớm nữa) - guard giữ nguyên logic cũ,
  // chỉ còn đúng vai trò lọc sự kiện 'end' từ MỘT PHIÊN NGHE KHÁC hoàn toàn (native module là
  // singleton toàn cục, xem chú thích guard 'error' bên dưới).
  useSpeechRecognitionEvent('end', finishListening);

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
      clearMaxListenTimer();
      clearStopFallbackTimer();
      setVolume(0);

      const code = ((event as any).error ?? '').toLowerCase();
      const msg = (event.message ?? '').toLowerCase();
      let viMsg: string;
      if (code === 'no-speech' || msg.includes('no speech') || msg.includes('no_speech')) {
        viMsg = t('voice.error_no_speech');
      } else if (code === 'not-allowed' || msg.includes('permission') || msg.includes('not_allowed')) {
        viMsg = t('voice.error_permission');
      } else if (code === 'service-not-allowed') {
        // Tách riêng khỏi 'not-allowed' (2026-07-28) - theo docs expo-speech-recognition, code
        // này nghĩa là dịch vụ nhận diện giọng nói KHÔNG KHẢ DỤNG trên thiết bị (thiếu ROM/dịch
        // vụ), KHÔNG PHẢI thiếu quyền - trước đây gộp chung "cần cấp quyền micro" là SAI bản
        // chất, khiến user cấp quyền lại vô ích rồi vẫn không dùng được (đúng triệu chứng "box
        // Android ô tô không bắt được giọng nói" user báo - dù preflight `isRecognitionAvailable()`
        // ở `listen()` đã chặn phần lớn trường hợp này từ trước, giữ nhánh riêng ở đây phòng
        // trường hợp khả dụng đổi giữa lúc check và lúc `start()` thật sự chạy).
        viMsg = t('voice.error_not_available');
      } else if (code === 'language-not-supported') {
        viMsg = t('voice.error_language_not_supported');
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
      // Rung báo lỗi (cải thiện UX 2026-07-28, góp ý user: cần tín hiệu không chỉ dựa vào mắt -
      // quan trọng hơn hẳn lúc đang lái xe, không tiện nhìn màn hình để đọc dòng lỗi nhỏ).
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return 'error';
    });
  });

  // Hiệu ứng "sóng sánh" (góp ý user 2026-07-27, kiểu Kiki): volumechange trả cường độ âm lượng
  // sống trong lúc nghe (range gốc -2..10, "dưới 0 coi như im lặng" theo docs expo-speech-
  // recognition) - chuẩn hoá về 0..1 cho UI vẽ waveform. CHỈ áp dụng khi CHÍNH instance này đang
  // 'listening' - cùng lý do guard 'end'/'error' ở trên (native event toàn cục, không riêng theo
  // instance nào gọi start()).
  useSpeechRecognitionEvent('volumechange', (event) => {
    setStatus((s) => {
      if (s === 'listening') {
        const clamped = Math.max(0, Math.min(10, event.value));
        setVolume(clamped / 10);
      }
      return s;
    });
  });

  const listen = useCallback(async (onResult: (value: string, raw: string) => void) => {
    // Rà soát 2026-07-28 (user báo "trên box Android ô tô không bắt được giọng nói, dùng Kiki
    // vẫn được"): `isRecognitionAvailable()` kiểm tra TRƯỚC xem thiết bị có dịch vụ nhận diện
    // giọng nói nào không (Android: cần "Google Speech Services"/tương đương đăng ký làm
    // SpeechRecognizer hệ thống) - nhiều box Android ô tô (đặc biệt ROM không có Google Mobile
    // Services đầy đủ) KHÔNG có dịch vụ này, trong khi Kiki hoạt động được vì dùng ENGINE GIỌNG
    // NÓI RIÊNG của hãng (không qua API chuẩn Android như app này), không phải cùng 1 cơ chế.
    // Nếu không kiểm tra trước, `start()` vẫn gọi được nhưng KHÔNG BAO GIỜ bắn 'result' - trải
    // nghiệm giống hệt "bấm mic, im lặng, không nghe được gì" mà user mô tả. Kiểm tra trước để
    // báo lỗi CHÍNH XÁC ngay lập tức thay vì treo "Đang nghe..." vô ích rồi mới timeout.
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      console.warn(
        '[useVoiceInput] Nhận diện giọng nói KHÔNG khả dụng trên thiết bị này - dịch vụ hiện có:',
        ExpoSpeechRecognitionModule.getSpeechRecognitionServices?.() ?? '(không lấy được danh sách)',
      );
      setStatus('error');
      setError(t('voice.error_not_available'));
      return;
    }

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setStatus('error');
      setError(t('voice.error_permission'));
      return;
    }
    callbackRef.current = onResult;
    latestResultRef.current = null;
    clearStopFallbackTimer();
    setError(null);
    setVolume(0);
    setStatus('listening');
    // Rung nhẹ báo "bắt đầu nghe được rồi" (cải thiện UX 2026-07-28, góp ý user: kiểu Siri/Google
    // Assistant - trước đây không có tín hiệu nào ngoài đổi UI, dễ nói hụt vài giây đầu vì
    // không chắc mic đã bật thật chưa, nhất là ở popup tự động nghe ngay khi mở).
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    ExpoSpeechRecognitionModule.start({
      lang: 'vi-VN',
      interimResults: false,
      maxAlternatives: 1,
      volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
    });

    // Giới hạn an toàn (mục đích: "có thời hạn nói" - góp ý user): gọi stop() (KHÔNG phải
    // abort()) sau MAX_LISTEN_MS nếu phiên nghe vẫn chưa tự kết thúc - stop() vẫn cố lấy kết quả
    // cuối cùng qua sự kiện 'result'/'end' thay vì huỷ trắng như abort(). Native tự dừng SỚM HƠN
    // mốc này nếu phát hiện user đã im lặng sau khi nói xong (hành vi mặc định của
    // SpeechRecognizer/interimResults:false, xem ExpoSpeechRecognitionOptions.continuous) - timer
    // này chỉ là lưới an toàn cho trường hợp recognizer không tự kết thúc.
    clearMaxListenTimer();
    maxListenTimerRef.current = setTimeout(() => {
      ExpoSpeechRecognitionModule.stop();
      // Cùng lưới an toàn với stop() thủ công bên dưới (phòng 'end' không bao giờ tới) - gọi
      // thẳng finishListening thay vì stop() để khỏi phụ thuộc thứ tự khai báo trong file.
      clearStopFallbackTimer();
      stopFallbackTimerRef.current = setTimeout(finishListening, 3_000);
    }, MAX_LISTEN_MS);
  }, [t, finishListening]);

  const stop = useCallback(() => {
    // Rà soát 2026-07-27 (fix bug thật): KHÔNG tự set status='idle' ở đây nữa - trước đây làm
    // vậy khiến handler 'end' phía trên (mang transcript thật qua guard `s !== 'listening'`) âm
    // thầm bỏ qua kết quả vừa nói mỗi khi user chủ động bấm dừng, callback không bao giờ được
    // gọi (bug thật user báo: "ấn mic, nói xong ấn lần 2 để dừng thì không thấy gửi gì"). Chỉ gọi
    // native stop() - vẫn cố trả kết quả cuối qua 'result' rồi 'end' xử lý status/callback như
    // bình thường (dùng chung logic với native tự dừng, không lặp code).
    clearMaxListenTimer();
    ExpoSpeechRecognitionModule.stop();

    // Lưới an toàn: nếu 'end' vẫn không tới sau ngần này (ROM lỗi/không tuân thủ hợp đồng
    // SpeechRecognizer), tự đóng phiên nghe thay vì kẹt mãi ở 'listening' - xem chú thích
    // stopFallbackTimerRef phía trên.
    clearStopFallbackTimer();
    stopFallbackTimerRef.current = setTimeout(finishListening, 3_000);
  }, [finishListening]);

  useEffect(() => () => {
    clearMaxListenTimer();
    clearStopFallbackTimer();
  }, []);

  return { listen, stop, status, error, volume };
}
