import {
  OBD_METRICS,
  pickFeaturedSecondary,
  filterSupportedMetrics,
  quantizeValue,
  ObdMetricKey,
} from '../obdMetrics';

function metricValue(key: ObdMetricKey) {
  const def = OBD_METRICS.find((m) => m.key === key)!;
  return { def, value: 1 };
}

describe('pickFeaturedSecondary', () => {
  it('trả về đúng 3 chỉ số ưu tiên cao nhất khi xe hỗ trợ đủ', () => {
    const secondary = OBD_METRICS.filter((m) => m.key !== 'speedKmh' && m.key !== 'rpm').map((m) => ({ def: m, value: 1 }));
    const featured = pickFeaturedSecondary(secondary);
    expect(featured.map((f) => f.def.key)).toEqual(['coolantTempC', 'controlModuleVoltage', 'engineLoadPct']);
  });

  it('nhường chỗ cho chỉ số kế tiếp khi thiếu nhiên liệu (PID 2F ít xe hỗ trợ)', () => {
    const secondary = [
      metricValue('coolantTempC'),
      metricValue('controlModuleVoltage'),
      metricValue('engineLoadPct'),
      metricValue('throttlePct'),
      // fuelLevelPct, oilTempC: xe KHÔNG hỗ trợ
    ];
    const featured = pickFeaturedSecondary(secondary);
    // Vẫn đủ 3 ô, không có ô nào bị bỏ trống
    expect(featured).toHaveLength(3);
    expect(featured.map((f) => f.def.key)).toEqual(['coolantTempC', 'controlModuleVoltage', 'engineLoadPct']);
  });

  it('nhường tới tận PID ít phổ biến nhất khi xe chỉ hỗ trợ đúng nhóm đó', () => {
    const secondary = [metricValue('fuelLevelPct'), metricValue('oilTempC')];
    const featured = pickFeaturedSecondary(secondary);
    expect(featured.map((f) => f.def.key)).toEqual(['fuelLevelPct', 'oilTempC']);
  });

  it('trả về mảng rỗng khi xe không hỗ trợ PID phụ nào - không crash', () => {
    expect(pickFeaturedSecondary([])).toEqual([]);
  });

  it('tôn trọng tham số count tuỳ chỉnh', () => {
    const secondary = OBD_METRICS.filter((m) => m.key !== 'speedKmh' && m.key !== 'rpm').map((m) => ({ def: m, value: 1 }));
    expect(pickFeaturedSecondary(secondary, 2)).toHaveLength(2);
  });
});

describe('filterSupportedMetrics', () => {
  it('trả về nguyên bộ khi chưa dò được capability (null)', () => {
    expect(filterSupportedMetrics(OBD_METRICS, null)).toHaveLength(OBD_METRICS.length);
  });

  it('chỉ giữ lại metric có PID được xe hỗ trợ', () => {
    const result = filterSupportedMetrics(OBD_METRICS, ['0D', '0C']);
    expect(result.map((m) => m.key)).toEqual(['speedKmh', 'rpm']);
  });
});

describe('quantizeValue', () => {
  it('làm tròn về bội số của step', () => {
    expect(quantizeValue(2280, 50)).toBe(2300);
    expect(quantizeValue(2274, 50)).toBe(2250);
  });

  it('giữ nguyên giá trị khi không có step', () => {
    expect(quantizeValue(2280, undefined)).toBe(2280);
  });

  it('giữ nguyên null', () => {
    expect(quantizeValue(null, 50)).toBeNull();
  });
});
