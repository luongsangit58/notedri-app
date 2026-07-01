import { ViewStyle } from 'react-native';

/**
 * Giới hạn bề rộng nội dung + căn giữa. Trên màn hẹp (điện thoại dọc) không có tác dụng
 * (nội dung < 720), trên màn RỘNG/landscape (màn hình xe ô tô) giữ cột đọc gọn, không kéo giãn xấu.
 * Merge vào contentContainerStyle của ScrollView/FlatList.
 */
export const contentWide: ViewStyle = { width: '100%', maxWidth: 720, alignSelf: 'center' };
