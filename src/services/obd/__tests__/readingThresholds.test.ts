/**
 * Test ngưỡng hiển thị "bình thường/bất thường" trên màn Chẩn đoán
 * (ObdSystemHealthScreen). Các mốc số PHẢI khớp đúng với diagnosticRules.json
 * (engine-overheat, thermostat-stuck-open-suspect, charging-voltage-*,
 * high-idle-warm) - test này khoá lại đúng các mốc đó, không phải test hành
 * vi mới, tránh 2 nơi trong app lệch ngưỡng nhau sau này.
 */
import { classifyCoolantTemp, classifyRunningVoltage, classifyIdleRpm } from '../readingThresholds';

describe('classifyCoolantTemp', () => {
  it('dưới 70°C - đang làm nóng máy (info, không phải xấu)', () => {
    expect(classifyCoolantTemp(69).level).toBe('info');
    expect(classifyCoolantTemp(20).level).toBe('info');
  });

  it('70-99°C - bình thường (khớp vùng vận hành chuẩn 82-100°C)', () => {
    expect(classifyCoolantTemp(70).level).toBe('ok');
    expect(classifyCoolantTemp(88).level).toBe('ok');
    expect(classifyCoolantTemp(99).level).toBe('ok');
  });

  it('100-104°C - hơi cao, cảnh báo warn (dưới ngưỡng critical của rule engine-overheat)', () => {
    expect(classifyCoolantTemp(100).level).toBe('warn');
    expect(classifyCoolantTemp(104).level).toBe('warn');
  });

  it('>=105°C - quá nhiệt critical (khớp CHÍNH XÁC rule engine-overheat)', () => {
    expect(classifyCoolantTemp(105).level).toBe('critical');
    expect(classifyCoolantTemp(120).level).toBe('critical');
  });
});

describe('classifyRunningVoltage', () => {
  it('dưới 12.4V - không sạc, critical (khớp rule charging-voltage-critical-low)', () => {
    expect(classifyRunningVoltage(12.39).level).toBe('critical');
    expect(classifyRunningVoltage(11.0).level).toBe('critical');
  });

  it('12.4-13.19V - sạc yếu, warn (khớp rule charging-voltage-low)', () => {
    expect(classifyRunningVoltage(12.4).level).toBe('warn');
    expect(classifyRunningVoltage(13.0).level).toBe('warn');
  });

  it('13.2-15.0V - bình thường', () => {
    expect(classifyRunningVoltage(13.2).level).toBe('ok');
    expect(classifyRunningVoltage(14.2).level).toBe('ok');
    expect(classifyRunningVoltage(15.0).level).toBe('ok');
  });

  it('trên 15V - sạc quá cao, critical (khớp rule charging-voltage-high)', () => {
    expect(classifyRunningVoltage(15.01).level).toBe('critical');
    expect(classifyRunningVoltage(16).level).toBe('critical');
  });
});

describe('classifyIdleRpm', () => {
  it('máy chưa ấm (coolant < 80°C) - luôn info, không phán xét rpm', () => {
    expect(classifyIdleRpm(2000, 60).level).toBe('info');
    expect(classifyIdleRpm(300, 60).level).toBe('info');
    expect(classifyIdleRpm(800, null)).toEqual(classifyIdleRpm(800, 80)); // null = coi như đã ấm, không chặn oan
  });

  it('máy ấm, rpm cao hơn 1200 - warn (khớp rule high-idle-warm)', () => {
    expect(classifyIdleRpm(1201, 85).level).toBe('warn');
    expect(classifyIdleRpm(1500, 85).level).toBe('warn');
  });

  it('máy ấm, rpm dưới 500 - warn (nguy cơ chết máy)', () => {
    expect(classifyIdleRpm(499, 85).level).toBe('warn');
  });

  it('máy ấm, rpm 500-1200 - bình thường', () => {
    expect(classifyIdleRpm(500, 85).level).toBe('ok');
    expect(classifyIdleRpm(800, 85).level).toBe('ok');
    expect(classifyIdleRpm(1200, 85).level).toBe('ok');
  });
});
