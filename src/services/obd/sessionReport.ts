import { ObdSessionSummary } from '../../api/obd';
import { evaluate, dedupeFindings, DiagnosticRule, Finding, VehicleSnapshot } from './diagnosticEngine';
import rulesFile from '../../data/diagnosticRules.json';

const RULES = (rulesFile as { rules: DiagnosticRule[] }).rules;

/**
 * Daily Vehicle Report (checklist E6/C3, Technical Bible v8-F10): tái dùng
 * NGUYÊN diagnosticEngine đã có cho live monitor - chạy trên summary tổng hợp
 * cuối phiên (E1) thay vì 1 snapshot tức thời. Điện áp có 2 hướng lệch (thấp/cao)
 * nên evaluate() chạy 2 lần với voltage_min/voltage_max rồi gộp kết quả duy nhất -
 * không cần sửa engine, chỉ khác cách nạp input.
 */
export function evaluateSession(summary: ObdSessionSummary, durationSeconds: number): Finding[] {
  const base: Omit<VehicleSnapshot, 'controlModuleVoltage'> = {
    rpm: summary.rpm_idle_avg,
    speedKmh: 0, // rpm_idle_avg chỉ tích luỹ lúc xe đứng yên - đại diện đúng ngữ cảnh garanti
    engineLoadPct: summary.load_avg,
    coolantTempC: summary.coolant_max, // cực trị: đủ cho cả 2 chiều (quá nhiệt / không đạt nhiệt)
    throttlePct: null,
    sessionAgeSeconds: durationSeconds,
  };
  const lowFindings = evaluate(RULES, { ...base, controlModuleVoltage: summary.voltage_min });
  const highFindings = evaluate(RULES, { ...base, controlModuleVoltage: summary.voltage_max });
  return dedupeFindings(lowFindings, highFindings);
}
