import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'app_device_id';
let cached: string | null = null;

function generate(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored) { cached = stored; return stored; }
    const id = generate();
    await AsyncStorage.setItem(KEY, id);
    cached = id;
    return id;
  } catch {
    return 'fallback-device';
  }
}
