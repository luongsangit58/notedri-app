import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../api/client';
import { DiagnosticRule } from './diagnosticEngine';
// Snapshot SINH TỰ ĐỘNG từ repo Laravel (npm run sync:rules) - không sửa tay,
// chỉ dùng làm fallback offline/cold-start trước khi tải được từ server.
import bundledSnapshot from '../../data/diagnosticRules.json';

const CACHE_KEY = 'obd_diagnostic_rules_cache';

type RulesPayload = { version: number; rules: DiagnosticRule[] };

/**
 * Rule Engine v2 lên server (14/7): app đọc rule mới nhất qua GET
 * /diagnostic-rules thay vì đóng cứng trong bản build - sửa 1 ngưỡng rule
 * không còn cần build lại APK. Thứ tự ưu tiên: cache đã tải > snapshot bundled
 * > (không bao giờ rỗng, luôn có ít nhất bundled để evaluate() chạy được).
 */
let activeRules: DiagnosticRule[] = bundledSnapshot.rules as DiagnosticRule[];
let cacheLoaded = false;

async function loadCacheOnce(): Promise<void> {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached: RulesPayload = JSON.parse(raw);
    if (Array.isArray(cached.rules) && cached.rules.length > 0) {
      activeRules = cached.rules;
    }
  } catch {
    // Đọc cache lỗi - giữ nguyên bundled fallback
  }
}

/** Rule đang dùng NGAY LÚC NÀY (đồng bộ - dùng được cho Daily Report render tức thời). */
export function getActiveRules(): DiagnosticRule[] {
  return activeRules;
}

/**
 * Tải rule mới nhất từ server rồi cache lại (fire-and-forget, không chặn UI).
 * Gọi sau khi kết nối OBD thành công - đúng lúc rule sắp được dùng.
 */
export async function refreshRulesFromServer(): Promise<void> {
  await loadCacheOnce();
  try {
    const res = await client.get<{ data: RulesPayload }>('/diagnostic-rules');
    const payload = res.data.data;
    if (Array.isArray(payload.rules) && payload.rules.length > 0) {
      activeRules = payload.rules;
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload)).catch(() => {});
    }
  } catch {
    // Mất mạng / server lỗi - giữ nguyên rule đang có (cache cũ hoặc bundled)
  }
}

void loadCacheOnce();
