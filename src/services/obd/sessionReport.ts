import { ObdSessionSummary } from '../../api/obd';
import { evaluate, dedupeFindings, Finding, VehicleSnapshot } from './diagnosticEngine';
import { getActiveRules } from './diagnosticRulesStore';

/**
 * Daily Vehicle Report (checklist E6/C3, Technical Bible v8-F10): tái dùng
 * NGUYÊN diagnosticEngine đã có cho live monitor - chạy trên summary tổng hợp
 * cuối phiên (E1) thay vì 1 snapshot tức thời. Điện áp có 2 hướng lệch (thấp/cao)
 * nên evaluate() chạy 2 lần với voltage_min/voltage_max rồi gộp kết quả duy nhất -
 * không cần sửa engine, chỉ khác cách nạp input.
 */
export function evaluateSession(summary: ObdSessionSummary, durationSeconds: number): Finding[] {
  // Thời gian MÁY CHẠY (sửa 14/7): dùng engine_run_seconds nếu có (phiên mới),
  // fallback durationSeconds cho phiên cũ trước khi có trường này.
  const engineRunSeconds = summary.engine_run_seconds ?? durationSeconds;
  // Base "đứng yên" - CHỈ dùng cho rule cần đúng ngữ cảnh garanti (high-idle-warm):
  // rpm/throttle tích luỹ lúc speedKmh===0 (xem obdLiveMonitor aggIdleRpm/aggIdleThrottle).
  const idleBase: Omit<VehicleSnapshot, 'controlModuleVoltage'> = {
    rpm: summary.rpm_idle_avg,
    speedKmh: 0,
    engineLoadPct: summary.load_avg,
    coolantTempC: summary.coolant_max, // cực trị: đủ cho cả 2 chiều (quá nhiệt / không đạt nhiệt)
    throttlePct: summary.throttle_idle_avg ?? null,
    engineRunSeconds,
  };
  // Base "máy đang nổ" (mọi tốc độ, không riêng lúc đứng yên) - cho rule chỉ cần
  // xác nhận máy đang chạy (sạc điện, van hằng nhiệt): dùng rpm_avg thay vì
  // rpm_idle_avg để KHÔNG bị bỏ qua oan trên 1 chuyến chạy thuần cao tốc không hề
  // dừng đèn đỏ - rpm_idle_avg null trong trường hợp đó dù voltage/coolant vẫn có
  // đủ dữ liệu để đánh giá (phát hiện qua rà soát 14/7). speedKmh để null (không
  // phải 0) để rule high-idle-warm (đòi hỏi speedKmh) không bị lẫn vào nhánh này.
  const runningBase: Omit<VehicleSnapshot, 'controlModuleVoltage'> = {
    rpm: summary.rpm_avg ?? summary.rpm_idle_avg,
    speedKmh: null,
    engineLoadPct: summary.load_avg,
    coolantTempC: summary.coolant_max,
    throttlePct: null,
    engineRunSeconds,
  };
  const rules = getActiveRules();
  const results = [idleBase, runningBase].flatMap((base) => [
    evaluate(rules, { ...base, controlModuleVoltage: summary.voltage_min }),
    evaluate(rules, { ...base, controlModuleVoltage: summary.voltage_max }),
  ]);
  return dedupeFindings(...results);
}
