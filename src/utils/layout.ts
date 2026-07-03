import { ViewStyle } from 'react-native';

/**
 * Giới hạn bề rộng nội dung + căn giữa. Trên màn hẹp (điện thoại dọc) không có tác dụng,
 * trên màn RỘNG/landscape (head-unit ô tô) lấp gần hết bề ngang thay vì để cột hẹp 720
 * lọt thỏm giữa 2 khoảng trống ("không tràn màn hình"), nhưng vẫn cap để không kéo giãn xấu.
 * Merge vào contentContainerStyle của ScrollView/FlatList.
 */
export const contentWide: ViewStyle = { width: '100%', maxWidth: 1024, alignSelf: 'center' };
