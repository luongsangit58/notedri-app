import { Platform } from 'react-native';

// Không thêm font asset mới (7-segment/monospace riêng) - dùng font hệ thống
// sẵn có trên mỗi nền tảng để số liệu "đứng đều" (tabular-like) và mặt đồng hồ
// cổ điển dùng được chữ serif, không tăng thêm dependency/asset nào.
export const monoFontFamily = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
export const serifFontFamily = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
