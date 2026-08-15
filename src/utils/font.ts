import { Platform } from 'react-native';

// Rà soát 15/8 (bug thật user báo: placeholder tiếng Việt trên iPhone bị "cách
// chữ ra" - dấu và chữ cái trông tách rời, xấu). Text nguồn đã đúng chuẩn NFC,
// không có fontFamily/letterSpacing tuỳ chỉnh nào gây ra - nghi vấn cao nhất là
// lỗi kerning của San Francisco (font hệ thống mặc định iOS, có bộ máy Dynamic
// Type phức tạp) khi ghép dấu tiếng Việt, ĐẶC BIỆT ở placeholder (TextInput
// dùng đường render placeholder khác với text đã gõ). Ép hẳn sang Helvetica
// Neue - font dựng sẵn trên MỌI iOS (không cần bundle thêm font/rebuild native),
// kerning ổn định, tránh hẳn bộ máy Dynamic Type của San Francisco. Android giữ
// nguyên font hệ thống (Roboto) - lỗi chỉ được báo trên iPhone.
export const INPUT_FONT_FAMILY = Platform.OS === 'ios' ? 'Helvetica Neue' : undefined;
