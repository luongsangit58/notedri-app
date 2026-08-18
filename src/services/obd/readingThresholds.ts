/**
 * Ngưỡng "bình thường/bất thường" cho vài chỉ số hay bị hỏi nhất trên màn Chẩn
 * đoán (ObdSystemHealthScreen). CỐ Ý dùng LẠI đúng số đã có nguồn trích dẫn
 * trong src/data/diagnosticRules.json (SAE J537, sổ tay Honda/Toyota...) thay
 * vì tự đặt số mới - tránh 2 nơi trong app disagree nhau về cùng 1 ngưỡng.
 *
 * KHÔNG cộng dồn thành điểm số xe (xem lý do "không chấm điểm" ở đầu
 * systemHealth.ts) - đây chỉ là phân loại TỪNG chỉ số riêng lẻ để hiển thị,
 * không phải engine tính điểm.
 */

export type ReadingLevel = 'ok' | 'warn' | 'critical' | 'info';

export type ReadingClassification = {
  level: ReadingLevel;
  /** Nhãn ngắn hiển thị dưới giá trị, vd "Bình thường"/"Quá nhiệt". */
  labelKey: string;
  /** Giải thích đầy đủ hơn (hiện khi user chạm vào số liệu). */
  explainKey: string;
};

/**
 * Nước làm mát (coolant). Nguồn: rule engine-overheat (>=105°C critical) +
 * thermostat-stuck-open-suspect (<70°C sau khi chạy >=10 phút = nghi van hằng
 * nhiệt kẹt). Vùng vận hành chuẩn 82-100°C theo sổ tay Honda/Toyota.
 */
export function classifyCoolantTemp(celsius: number): ReadingClassification {
  if (celsius >= 105) {
    return { level: 'critical', labelKey: 'obd.range_coolant_critical', explainKey: 'obd.range_coolant_explain' };
  }
  if (celsius >= 100) {
    return { level: 'warn', labelKey: 'obd.range_coolant_warn', explainKey: 'obd.range_coolant_explain' };
  }
  if (celsius >= 70) {
    return { level: 'ok', labelKey: 'obd.range_coolant_ok', explainKey: 'obd.range_coolant_explain' };
  }
  return { level: 'info', labelKey: 'obd.range_coolant_warming', explainKey: 'obd.range_coolant_explain' };
}

/**
 * Điện áp hệ thống ĐỌC QUA ECU (PID 42) trong lúc máy đang nổ (rpm đủ lớn để
 * chắc chắn máy phát đã chạy) - phản ánh máy phát có sạc đủ cho ắc-quy hay
 * không. KHÁC với bài kiểm tra ắc-quy nghỉ (ATRV, OBDTechnicalScreen) - đo
 * trực tiếp không qua ECU, dùng được cả lúc tắt máy, giữ nguyên logic riêng ở
 * đó vì là 2 phép đo khác ngữ cảnh. Nguồn: rule charging-voltage-*
 * (diagnosticRules.json - SAE J537, dải sạc chuẩn 13.5-14.7V).
 */
export function classifyRunningVoltage(volts: number): ReadingClassification {
  if (volts < 12.4) {
    return { level: 'critical', labelKey: 'obd.range_voltage_critical', explainKey: 'obd.range_voltage_explain' };
  }
  if (volts < 13.2) {
    return { level: 'warn', labelKey: 'obd.range_voltage_low', explainKey: 'obd.range_voltage_explain' };
  }
  if (volts <= 15.0) {
    return { level: 'ok', labelKey: 'obd.range_voltage_ok', explainKey: 'obd.range_voltage_explain' };
  }
  return { level: 'critical', labelKey: 'obd.range_voltage_high', explainKey: 'obd.range_voltage_explain' };
}

/**
 * Vòng tua không tải (rpm lúc xe đứng yên, speedKmh ~0). CHỈ có ý nghĩa "bình
 * thường/bất thường" khi xe đứng yên - rpm lúc đang chạy phụ thuộc hoàn toàn
 * cách đạp ga, không có ngưỡng cố định nên gọi hàm này lúc đó là sai ngữ
 * cảnh (caller phải tự kiểm tra speedKmh trước). Nguồn: rule high-idle-warm
 * (không tải chuẩn máy ấm 650-850rpm, cảnh báo >1200rpm).
 */
export function classifyIdleRpm(rpm: number, coolantTempC: number | null): ReadingClassification {
  if (coolantTempC !== null && coolantTempC < 80) {
    return { level: 'info', labelKey: 'obd.range_rpm_warming', explainKey: 'obd.range_rpm_explain' };
  }
  if (rpm > 1200) {
    return { level: 'warn', labelKey: 'obd.range_rpm_high', explainKey: 'obd.range_rpm_explain' };
  }
  if (rpm < 500) {
    return { level: 'warn', labelKey: 'obd.range_rpm_low', explainKey: 'obd.range_rpm_explain' };
  }
  return { level: 'ok', labelKey: 'obd.range_rpm_ok', explainKey: 'obd.range_rpm_explain' };
}
