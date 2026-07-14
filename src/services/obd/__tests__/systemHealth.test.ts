/**
 * Test C4 - sức khoẻ theo hệ thống (bản lean read-only). Kiểm tra gom nhóm +
 * phân loại trạng thái đúng, KHÔNG có logic chấm điểm nào cần verify vì bản này
 * cố ý không chấm điểm.
 */
import {
  buildSystemHealth,
  overallSystemStatus,
  SystemReadings,
} from '../systemHealth';
import { Finding } from '../diagnosticEngine';

// Đủ số liệu sống mọi hệ (giá trị thật fixture #2/#3 Honda City garanti)
const fullReadings: SystemReadings = {
  rpm: 820,
  engineLoadPct: 32,
  throttlePct: 14,
  coolantTempC: 88,
  controlModuleVoltage: 14.2,
  fuelLevelPct: 60,
};

const emptyReadings: SystemReadings = {
  rpm: null,
  engineLoadPct: null,
  throttlePct: null,
  coolantTempC: null,
  controlModuleVoltage: null,
  fuelLevelPct: null,
};

function finding(ruleId: string, severity: Finding['severity']): Finding {
  return {
    ruleId,
    title_vi: ruleId,
    action_vi: '',
    severity,
    can_drive: severity === 'critical' ? 'stop' : 'caution',
    beta: true,
  };
}

const bySys = (systems: ReturnType<typeof buildSystemHealth>, key: string) =>
  systems.find((s) => s.key === key)!;

describe('buildSystemHealth', () => {
  it('trả đúng 4 hệ theo thứ tự cố định', () => {
    const systems = buildSystemHealth([], fullReadings);
    expect(systems.map((s) => s.key)).toEqual(['engine', 'cooling', 'electrical', 'fuel']);
  });

  it('có số liệu + không finding = ok', () => {
    const systems = buildSystemHealth([], fullReadings);
    for (const s of systems) expect(s.status).toBe('ok');
  });

  it('không số liệu + không finding = na (không phải ok)', () => {
    const systems = buildSystemHealth([], emptyReadings);
    for (const s of systems) expect(s.status).toBe('na');
  });

  it('finding cooling critical đẩy hệ Làm mát thành critical, hệ khác vẫn ok', () => {
    const systems = buildSystemHealth([finding('engine-overheat', 'critical')], fullReadings);
    expect(bySys(systems, 'cooling').status).toBe('critical');
    expect(bySys(systems, 'engine').status).toBe('ok');
    expect(bySys(systems, 'electrical').status).toBe('ok');
  });

  it('finding sạc yếu (warn) vào hệ Điện', () => {
    const systems = buildSystemHealth([finding('charging-voltage-low', 'warn')], fullReadings);
    expect(bySys(systems, 'electrical').status).toBe('warn');
    expect(bySys(systems, 'electrical').findings).toHaveLength(1);
  });

  it('critical thắng warn trong cùng một hệ', () => {
    const systems = buildSystemHealth(
      [finding('charging-voltage-low', 'warn'), finding('charging-voltage-critical-low', 'critical')],
      fullReadings,
    );
    expect(bySys(systems, 'electrical').status).toBe('critical');
    expect(bySys(systems, 'electrical').findings).toHaveLength(2);
  });

  it('rule lạ rơi về hệ Động cơ (mặc định an toàn)', () => {
    const systems = buildSystemHealth([finding('some-future-rule', 'warn')], fullReadings);
    expect(bySys(systems, 'engine').status).toBe('warn');
  });

  it('số liệu từng hệ được đính kèm để hiển thị', () => {
    const systems = buildSystemHealth([], fullReadings);
    const engine = bySys(systems, 'engine');
    expect(engine.readings.map((r) => r.key).sort()).toEqual(['load', 'rpm', 'throttle']);
    expect(bySys(systems, 'cooling').readings).toEqual([{ key: 'coolant', value: 88, unit: '°C' }]);
    expect(bySys(systems, 'electrical').readings).toEqual([{ key: 'voltage', value: 14.2, unit: 'V' }]);
  });

  it('hệ mất riêng một tín hiệu vẫn ok nếu còn tín hiệu khác', () => {
    const systems = buildSystemHealth([], { ...fullReadings, rpm: null });
    const engine = bySys(systems, 'engine');
    expect(engine.status).toBe('ok');
    expect(engine.readings.map((r) => r.key)).not.toContain('rpm');
  });
});

describe('overallSystemStatus', () => {
  it('lấy hệ nặng nhất', () => {
    const systems = buildSystemHealth([finding('engine-overheat', 'critical')], fullReadings);
    expect(overallSystemStatus(systems)).toBe('critical');
  });

  it('mọi hệ ok = ok', () => {
    expect(overallSystemStatus(buildSystemHealth([], fullReadings))).toBe('ok');
  });

  it('mọi hệ na = na', () => {
    expect(overallSystemStatus(buildSystemHealth([], emptyReadings))).toBe('na');
  });

  it('warn thắng ok/na', () => {
    const systems = buildSystemHealth([finding('charging-voltage-low', 'warn')], fullReadings);
    expect(overallSystemStatus(systems)).toBe('warn');
  });
});
