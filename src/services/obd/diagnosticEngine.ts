/**
 * Diagnostic Rule Engine v2 (checklist giai đoạn D, thiết kế R7 trong
 * knowledge-engine-architecture-review): rule là DATA, engine là HÀM THUẦN -
 * không import React Native / DB / BLE nên test được bằng jest và chạy được ở
 * bất kỳ đâu (app realtime, server phân tích trip, emulator).
 *
 * Kỷ luật nguồn (nới lại 13/7 theo góp ý Sang): ngưỡng lấy từ TÀI LIỆU CÔNG KHAI
 * (ghi ở trường `source` của từng rule), cờ `beta` giữ nguyên tới khi dữ liệu
 * chạy thật xác nhận tín hiệu ổn định. Xe Sang = bài test tích hợp, không phải
 * nguồn tri thức.
 */

/** DTO snapshot - tách khỏi ObdSnapshot để engine không dính transport. */
export type VehicleSnapshot = {
  rpm: number | null;
  speedKmh: number | null;
  engineLoadPct: number | null;
  coolantTempC: number | null;
  throttlePct: number | null;
  controlModuleVoltage: number | null;
  /**
   * Giây MÁY ĐÃ CHẠY (rpm>0), KHÔNG phải giây kể từ khi BLE kết nối (sửa 14/7
   * theo rà soát): adapter cắm cổng OBD luôn có điện có thể connect trước khi
   * nổ máy - dùng thời gian BLE khiến rule van hằng nhiệt (đòi 600s) báo nhầm
   * ngay sau khi mới đề máy nguội. Mọi rule đều là chẩn đoán ĐỘNG CƠ nên đều
   * cần thời gian máy chạy thật.
   */
  engineRunSeconds: number;
};

export type RuleCondition = {
  signal: keyof Omit<VehicleSnapshot, 'engineRunSeconds'>;
  op: 'gt' | 'gte' | 'lt' | 'lte';
  value: number;
};

export type DiagnosticRule = {
  id: string;
  title_vi: string;
  action_vi: string;
  severity: 'critical' | 'warn' | 'info';
  can_drive: 'yes' | 'caution' | 'stop';
  /** Mọi tín hiệu này phải KHÁC null thì rule mới được xét (capability gating). */
  required_signals: Array<keyof Omit<VehicleSnapshot, 'engineRunSeconds'>>;
  /** Ngưỡng giây MÁY CHẠY tối thiểu (so với engineRunSeconds, không phải thời gian BLE). */
  min_session_seconds: number;
  /** TẤT CẢ điều kiện phải đúng (AND). */
  conditions: RuleCondition[];
  /** Nguồn tài liệu của ngưỡng - BẮT BUỘC, không có nguồn không có rule. */
  source: string;
  /** Mã DTC tương ứng (nếu có) - để hiện chi phí sửa từ từ điển cho finding (C2). */
  related_dtc?: string;
  beta: boolean;
};

export type Finding = {
  ruleId: string;
  title_vi: string;
  action_vi: string;
  severity: DiagnosticRule['severity'];
  can_drive: DiagnosticRule['can_drive'];
  related_dtc?: string;
  beta: boolean;
};

function conditionMet(cond: RuleCondition, value: number): boolean {
  switch (cond.op) {
    case 'gt': return value > cond.value;
    case 'gte': return value >= cond.value;
    case 'lt': return value < cond.value;
    case 'lte': return value <= cond.value;
  }
}

/**
 * Hàm thuần duy nhất của engine: rules + snapshot vào, findings ra.
 * Rule bị BỎ QUA (không phải fail) khi thiếu tín hiệu hoặc phiên còn non -
 * "không đủ dữ liệu" khác với "không có vấn đề".
 */
/**
 * Chuẩn hoá danh sách Finding: dedupe theo ruleId, giữ bản xuất hiện trước.
 * Dùng khi evaluate() được gọi nhiều lần trên các biến thể snapshot (vd Daily
 * Report chạy 2 lần với voltage_min/voltage_max rồi gộp - xem obdLiveMonitor).
 */
export function dedupeFindings(...lists: Finding[][]): Finding[] {
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const list of lists) {
    for (const f of list) {
      if (seen.has(f.ruleId)) continue;
      seen.add(f.ruleId);
      out.push(f);
    }
  }
  return out;
}

export function evaluate(rules: DiagnosticRule[], snapshot: VehicleSnapshot): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    if (snapshot.engineRunSeconds < rule.min_session_seconds) continue;
    if (rule.required_signals.some((sig) => snapshot[sig] === null)) continue;

    const allMet = rule.conditions.every((cond) =>
      conditionMet(cond, snapshot[cond.signal] as number),
    );
    if (!allMet) continue;

    findings.push({
      ruleId: rule.id,
      title_vi: rule.title_vi,
      action_vi: rule.action_vi,
      severity: rule.severity,
      can_drive: rule.can_drive,
      related_dtc: rule.related_dtc,
      beta: rule.beta,
    });
  }

  return findings;
}
