/**
 * Test Diagnostic Engine v2: engine thuần + bộ rule có nguồn dẫn.
 * Snapshot nền lấy từ GIÁ TRỊ THẬT của fixture #2/#3 (Honda City garanti).
 */
import { evaluate, DiagnosticRule, VehicleSnapshot } from '../diagnosticEngine';
import rulesFile from '../../../data/diagnosticRules.json';

const RULES = rulesFile.rules as DiagnosticRule[];

// Xe Sang, máy nổ garanti, đang ấm dần (fixture #2) + điện áp giả định khoẻ
const healthyIdle: VehicleSnapshot = {
  rpm: 1037,
  speedKmh: 0,
  engineLoadPct: 41,
  coolantTempC: 55,
  throttlePct: 16,
  controlModuleVoltage: 14.34, // giá trị thật từ ảnh Car Scanner 13/7
  engineRunSeconds: 120,
};

describe('bộ rule diagnosticRules.json - kỷ luật schema', () => {
  it('mọi rule phải có nguồn dẫn + cờ beta + enum hợp lệ', () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const r of RULES) {
      expect(r.source.length).toBeGreaterThan(20);
      expect(r.beta).toBe(true);
      expect(['critical', 'warn', 'info']).toContain(r.severity);
      expect(['yes', 'caution', 'stop']).toContain(r.can_drive);
      expect(r.conditions.length).toBeGreaterThan(0);
      // Mọi tín hiệu trong conditions phải được khai báo ở required_signals
      for (const c of r.conditions) {
        expect(r.required_signals).toContain(c.signal);
      }
    }
  });
});

describe('evaluate - hàm thuần', () => {
  it('xe khoẻ (giá trị thật fixture #2): không finding nào', () => {
    expect(evaluate(RULES, healthyIdle)).toEqual([]);
  });

  it('điện áp sạc 12.4V khi máy nổ → cảnh báo máy phát', () => {
    const findings = evaluate(RULES, { ...healthyIdle, controlModuleVoltage: 12.4 });
    expect(findings.map((f) => f.ruleId)).toEqual(['charging-voltage-low']);
    expect(findings[0].can_drive).toBe('caution');
    expect(findings[0].beta).toBe(true);
  });

  it('quá nhiệt 107°C → dừng xe, bất kể phiên mới', () => {
    const findings = evaluate(RULES, {
      ...healthyIdle,
      coolantTempC: 107,
      engineRunSeconds: 5,
    });
    expect(findings.map((f) => f.ruleId)).toContain('engine-overheat');
    expect(findings.find((f) => f.ruleId === 'engine-overheat')!.can_drive).toBe('stop');
  });

  it('chạy 11 phút mà nước mới 62°C → nghi van hằng nhiệt', () => {
    const findings = evaluate(RULES, {
      ...healthyIdle,
      coolantTempC: 62,
      engineRunSeconds: 660,
    });
    expect(findings.map((f) => f.ruleId)).toEqual(['thermostat-stuck-open-suspect']);
  });

  it('thiếu tín hiệu (voltage null) → rule điện áp bị BỎ QUA, không phán bừa', () => {
    const findings = evaluate(RULES, {
      ...healthyIdle,
      controlModuleVoltage: null,
    });
    expect(findings).toEqual([]);
  });

  it('phiên còn non → rule cần thời gian không được xét', () => {
    // 62°C ở giây thứ 60 là bình thường (máy đang ấm) - không được nghi thermostat
    const findings = evaluate(RULES, {
      ...healthyIdle,
      coolantTempC: 62,
      engineRunSeconds: 60,
    });
    expect(findings).toEqual([]);
  });

  it('máy ấm đứng yên tua 1350 → nghi P0507', () => {
    const findings = evaluate(RULES, {
      ...healthyIdle,
      rpm: 1350,
      coolantTempC: 88,
      throttlePct: 10,
      engineRunSeconds: 300,
    });
    expect(findings.map((f) => f.ruleId)).toEqual(['high-idle-warm']);
  });
});
