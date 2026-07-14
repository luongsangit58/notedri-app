/**
 * Daily Report (E6/C3): evaluate() phải chạy đúng cả 2 hướng điện áp (thấp/cao)
 * và gộp không trùng - đây là chỗ dễ sai nhất khi tái dùng engine 1-chiều cho
 * input 2 cực trị (voltage_min/voltage_max) của một phiên.
 */
import { evaluateSession } from '../sessionReport';
import { ObdSessionSummary } from '../../../api/obd';

const baseSummary: ObdSessionSummary = {
  samples: 76,
  coolant_max: 84,
  coolant_min: 48,
  voltage_min: 14.0,
  voltage_max: 14.5,
  voltage_avg: 14.32,
  rpm_idle_avg: 752,
  load_avg: 52,
  speed_max: 57,
  dtc_count: 0,
  findings: [],
};

describe('evaluateSession - phiên khoẻ (số liệu thật xe Sang 13/7)', () => {
  it('không finding nào', () => {
    expect(evaluateSession(baseSummary, 3348)).toEqual([]);
  });
});

describe('evaluateSession - điện áp lệch thấp', () => {
  it('voltage_min thấp -> báo máy phát yếu, không báo nhầm quá áp', () => {
    const findings = evaluateSession({ ...baseSummary, voltage_min: 12.4, voltage_max: 12.6 }, 3348);
    expect(findings.map((f) => f.ruleId)).toEqual(['charging-voltage-low']);
  });
});

describe('evaluateSession - điện áp lệch cao', () => {
  it('voltage_max cao -> báo tiết chế lỗi, không báo nhầm sạc yếu', () => {
    const findings = evaluateSession({ ...baseSummary, voltage_min: 14.0, voltage_max: 15.5 }, 3348);
    expect(findings.map((f) => f.ruleId)).toEqual(['charging-voltage-high']);
  });
});

describe('evaluateSession - dedupe khi cả 2 lần evaluate cùng ra 1 rule', () => {
  it('rule không phụ thuộc điện áp (quá nhiệt) không bị nhân đôi', () => {
    const findings = evaluateSession({ ...baseSummary, coolant_max: 108 }, 3348);
    const overheat = findings.filter((f) => f.ruleId === 'engine-overheat');
    expect(overheat).toHaveLength(1);
  });
});

describe('evaluateSession - thermostat kẹt mở dùng coolant_max làm cực trị', () => {
  it('chạy đủ lâu mà coolant_max vẫn thấp -> nghi thermostat', () => {
    const findings = evaluateSession({ ...baseSummary, coolant_max: 62 }, 700);
    expect(findings.map((f) => f.ruleId)).toContain('thermostat-stuck-open-suspect');
  });
});

describe('evaluateSession - chuyến chạy thuần cao tốc (không hề dừng đèn đỏ)', () => {
  // Bug phát hiện 14/7: rpm_idle_avg chỉ tích luỹ lúc xe đứng yên - một chuyến
  // không hề dừng có rpm_idle_avg=null, khiến 3 rule dùng "rpm" bị bỏ qua ÂM THẦM
  // dù voltage/coolant vẫn đủ dữ liệu để đánh giá. rpm_avg (mọi tốc độ) phải cứu
  // được các rule này.
  const highwayOnly: ObdSessionSummary = {
    ...baseSummary,
    rpm_idle_avg: null, // chưa từng đứng yên
    rpm_avg: 2400, // trung bình cả chuyến, đủ xác nhận máy đang chạy
  };

  it('điện áp lệch thấp vẫn báo được dù chưa từng đứng yên', () => {
    const findings = evaluateSession({ ...highwayOnly, voltage_min: 12.4, voltage_max: 12.6 }, 3348);
    expect(findings.map((f) => f.ruleId)).toContain('charging-voltage-low');
  });

  it('thermostat kẹt mở vẫn báo được dù chưa từng đứng yên', () => {
    const findings = evaluateSession({ ...highwayOnly, coolant_max: 62 }, 700);
    expect(findings.map((f) => f.ruleId)).toContain('thermostat-stuck-open-suspect');
  });

  it('high-idle-warm KHÔNG báo (đúng - rule này cần đúng ngữ cảnh đứng yên, không có dữ liệu để đánh giá)', () => {
    const findings = evaluateSession(highwayOnly, 3348);
    expect(findings.map((f) => f.ruleId)).not.toContain('high-idle-warm');
  });
});

describe('evaluateSession - throttle_idle_avg cho rule high-idle-warm', () => {
  // Bug phát hiện 14/7: throttlePct từng bị hardcode null trong sessionReport,
  // khiến high-idle-warm (đòi throttlePct) không bao giờ kích được qua Daily Report.
  it('tua garanti cao + bướm ga đóng (throttle thấp) + máy ấm -> báo nghi rò khí nạp', () => {
    const findings = evaluateSession({
      ...baseSummary,
      rpm_idle_avg: 1400,
      throttle_idle_avg: 10,
      coolant_max: 85,
    }, 3348);
    expect(findings.map((f) => f.ruleId)).toContain('high-idle-warm');
  });
});
