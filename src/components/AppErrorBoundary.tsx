import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { persistFatalError } from '../services/crashLog';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

/**
 * Rà soát crash 7/8: bọc TOÀN BỘ app - trước đây không có boundary nào, 1 lỗi
 * render bất kỳ (vd phép tính gauge ra NaN lúc đang lái) làm crash thẳng cả
 * app ở bản release, không màn hình nào hiện ra, không dấu vết gì để tra.
 * CỐ Ý không dùng useColors()/useT() ở fallback - nếu chính Theme/I18n
 * provider phía trên là nguồn lỗi, fallback dựa lại đúng context đó sẽ crash
 * tiếp ngay trong lúc catch.
 *
 * Lưu ý: ErrorBoundary chỉ bắt lỗi trong render/lifecycle của cây React bên
 * dưới nó - lỗi trong callback native (BLE/Classic) hoặc trong Promise không
 * đi qua đây, xem installGlobalErrorHandler() (crashLog.ts) cho phần đó.
 */
export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    persistFatalError(error, true);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827', padding: 24 }}>
          <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 16 }}>
            Đã có lỗi xảy ra. Vui lòng mở lại ứng dụng.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}
