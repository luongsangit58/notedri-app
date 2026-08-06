import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { useNetworkStatusStore } from '../store/networkStatusStore';
import { useT } from '../i18n';

// Rà soát 6/8 (user báo: mất mạng/có mạng lại không có phản hồi gì để biết) -
// toast riêng cho trạng thái MẠNG (khác ObdSessionBanner.tsx, chỉ nói về
// OBD2), đọc networkStatusStore do networkStatusListener.ts ghi. Cùng kiểu
// dáng pill nổi + tự ẩn như toast của ObdSessionBanner nhưng đặt lệch top
// (110 thay vì 60) để 2 toast không đè lên nhau nếu hiếm khi trùng thời điểm.
const TOAST_DURATION_MS = 4500;

export default function NetworkStatusToast() {
  const t = useT();
  const isOnline = useNetworkStatusStore((s) => s.isOnline);
  const [toast, setToast] = useState<string | null>(null);
  // undefined lúc mới mount: chưa biết trạng thái ban đầu, không được coi là
  // "vừa chuyển từ online sang offline" ngay lúc app mở lần đầu khi offline sẵn.
  const prev = useRef<boolean | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prev.current !== undefined && prev.current !== isOnline) {
      setToast(isOnline ? t('network.online_toast') : t('network.offline_toast'));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    }
    prev.current = isOnline;
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [isOnline, t]);

  if (!toast) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setToast(null)}
      style={{
        position: 'absolute',
        top: 110,
        alignSelf: 'center',
        backgroundColor: isOnline ? '#14532dee' : '#0f172aee',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        elevation: 8,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{toast}</Text>
    </TouchableOpacity>
  );
}
