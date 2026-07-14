import { Linking } from 'react-native';
import { parseAutoDriveUrl } from './NfcService';
import { handleAutoDriveLink } from './handleAutoDriveLink';
import { handleConnectLink } from './handleConnectLink';

const CONNECT_HOSTS = ['notedri.com', 'www.notedri.com'];
const CONNECT_PATH = '/connect';

// https://notedri.com/connect (Android App Link, chạm thẻ NFC hoặc mở trực tiếp) -
// so khớp host + path, bỏ qua query string/fragment vì URL này không mang tham số.
function isConnectUrl(url: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(url);
    return protocol === 'https:' && CONNECT_HOSTS.includes(hostname) && pathname.replace(/\/+$/, '') === CONNECT_PATH;
  } catch {
    return false;
  }
}

// Chống xử lý trùng: Android có thể phát cùng 1 URL qua cả Linking.getInitialURL()
// (cold start) lẫn sự kiện 'url' (app vừa mount xong nhận lại) - xử lý 2 lần sẽ
// auto-connect/điều hướng lặp lại.
let lastUrl: string | null = null;
let lastHandledAt = 0;
const DEDUPE_WINDOW_MS = 2000;

async function dispatch(url: string | null): Promise<void> {
  if (!url) return;

  const now = Date.now();
  if (url === lastUrl && now - lastHandledAt < DEDUPE_WINDOW_MS) return;
  lastUrl = url;
  lastHandledAt = now;

  if (parseAutoDriveUrl(url)) {
    await handleAutoDriveLink(url);
    return;
  }
  if (isConnectUrl(url)) {
    await handleConnectLink();
    return;
  }
  // URL không khớp 2 dạng trên (vd. callback Google OAuth, link khác của hệ thống) -
  // không phải việc của deep link NFC/OBD, bỏ qua.
}

let started = false;

// Gọi 1 lần ở App.tsx - phủ đủ 3 tình huống nhận deep link: Cold Start (getInitialURL),
// Background và Foreground (đều qua sự kiện 'url' của Linking).
export function initDeepLinkService(): () => void {
  if (started) return () => {};
  started = true;

  Linking.getInitialURL().then(dispatch).catch(() => {});
  const sub = Linking.addEventListener('url', ({ url }) => {
    dispatch(url).catch(() => {});
  });

  return () => {
    sub.remove();
    started = false;
  };
}
