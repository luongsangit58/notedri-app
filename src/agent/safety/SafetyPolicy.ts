import { IVehicleIO } from '../platform/types';

/**
 * Gác cổng duy nhất quyết định tool nào được thực thi theo trạng thái lái xe (docs/nori-agent-
 * plan.md mục 4, 7) - tách khỏi ToolRegistry. Bản tối giản Phase 1: chặn theo speed > 0. Chưa
 * có tool nào trong danh sách Phase 1 (mục 6, chỉ đọc) cần chặn khi đang lái - nhưng khai báo
 * sẵn danh sách `blockedWhileDriving` để Phase 2 (ocr.scanReceipt, fuel.create...) chỉ cần
 * thêm tên tool vào đây, không phải sửa lại ToolExecutor.
 */
const BLOCKED_WHILE_DRIVING = new Set<string>([
  // odometer.create/fuel.create cần nhìn màn hình xác nhận trước khi ghi (mục 4/7) - Phase 2
  // sẽ thêm tiếp 'ocr.scanReceipt', 'ocr.scanOdometer'... khi làm tới OCR.
  'odometer.create',
  'fuel.create',
]);

export class SafetyPolicy {
  constructor(private vehicleIO: IVehicleIO) {}

  isDriving(): boolean {
    const snapshot = this.vehicleIO.getSnapshot();
    return (snapshot?.speedKmh ?? 0) > 0;
  }

  canUseTool(toolName: string): { allowed: true } | { allowed: false; reason: string } {
    if (BLOCKED_WHILE_DRIVING.has(toolName) && this.isDriving()) {
      return { allowed: false, reason: 'blocked_while_driving' };
    }
    return { allowed: true };
  }
}
