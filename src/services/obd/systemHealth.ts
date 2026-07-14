/**
 * Sức khoẻ theo HỆ THỐNG (C4 - bản LEAN theo rà soát của Winston 14/7).
 *
 * KHÔNG phải engine chấm điểm 0-100/hệ: dự án CHƯA có dữ liệu chạy thật để hiệu
 * chuẩn thang điểm, đặt điểm bừa là tự bịa độ chính xác. Đây chỉ là VIEW ĐỌC:
 * gom lại các findings (Rule Engine) + số liệu sống mà Dashboard VỐN ĐÃ CÓ rồi
 * nhóm theo hệ, gắn trạng thái định tính ok/warn/critical/na. Không nguồn dữ liệu
 * mới, không suy diễn mới - chỉ trình bày lại thứ đã biết theo góc "từng hệ".
 *
 * Hàm thuần (không React/BLE/DB) nên test được bằng jest như diagnosticEngine.
 */

import { Finding } from './diagnosticEngine';

export type SystemKey = 'engine' | 'cooling' | 'electrical' | 'fuel';
/** na = KHÔNG có số liệu (khác "ok" = có số liệu và bình thường). */
export type SystemStatus = 'critical' | 'warn' | 'ok' | 'na';

export type SystemReading = {
  /** khoá ổn định để màn hình dịch nhãn (rpm/coolant/voltage/load/throttle/fuel). */
  key: 'rpm' | 'coolant' | 'voltage' | 'load' | 'throttle' | 'fuel';
  value: number;
  unit: string;
};

export type SystemHealth = {
  key: SystemKey;
  status: SystemStatus;
  readings: SystemReading[];
  findings: Finding[];
};

/** Số liệu sống cần cho view - tách khỏi ObdSnapshot để không dính transport. */
export type SystemReadings = {
  rpm: number | null;
  engineLoadPct: number | null;
  throttlePct: number | null;
  coolantTempC: number | null;
  controlModuleVoltage: number | null;
  fuelLevelPct: number | null;
};

/**
 * Rule nào thuộc hệ nào (khớp diagnostic_rules.json). Rule lạ (chưa có trong
 * bảng) rơi về 'engine' - mọi rule hiện tại đều là chẩn đoán powertrain nên
 * đây là mặc định an toàn, không phải đoán bừa hệ.
 */
const RULE_SYSTEM: Record<string, SystemKey> = {
  'charging-voltage-low': 'electrical',
  'charging-voltage-critical-low': 'electrical',
  'charging-voltage-high': 'electrical',
  'engine-overheat': 'cooling',
  'thermostat-stuck-open-suspect': 'cooling',
  'high-idle-warm': 'engine',
};

function systemOfFinding(f: Finding): SystemKey {
  return RULE_SYSTEM[f.ruleId] ?? 'engine';
}

/** Thứ tự hiển thị cố định + số liệu sống thuộc từng hệ. */
const SYSTEM_ORDER: SystemKey[] = ['engine', 'cooling', 'electrical', 'fuel'];

function readingsOf(key: SystemKey, r: SystemReadings): SystemReading[] {
  const out: SystemReading[] = [];
  const push = (k: SystemReading['key'], v: number | null, unit: string) => {
    if (v !== null) out.push({ key: k, value: v, unit });
  };
  switch (key) {
    case 'engine':
      push('rpm', r.rpm, '');
      push('load', r.engineLoadPct, '%');
      push('throttle', r.throttlePct, '%');
      break;
    case 'cooling':
      push('coolant', r.coolantTempC, '°C');
      break;
    case 'electrical':
      push('voltage', r.controlModuleVoltage, 'V');
      break;
    case 'fuel':
      push('fuel', r.fuelLevelPct, '%');
      break;
  }
  return out;
}

/**
 * Trạng thái 1 hệ: critical/warn theo finding NẶNG nhất; nếu không có finding thì
 * ok khi có ÍT NHẤT một số liệu sống, còn na khi hệ đó không đọc được gì
 * ("chưa đủ dữ liệu" khác "không có vấn đề" - cùng triết lý với evaluate()).
 * severity 'info' không hạ/nâng trạng thái (vẫn liệt kê trong findings).
 */
function statusOf(findings: Finding[], readings: SystemReading[]): SystemStatus {
  if (findings.some((f) => f.severity === 'critical')) return 'critical';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  if (readings.length > 0) return 'ok';
  return 'na';
}

/**
 * Gom findings + số liệu sống thành sức khoẻ 4 hệ (thứ tự cố định). Đây là toàn
 * bộ "engine" của C4: không tính điểm, chỉ phân loại + xếp nhóm.
 */
export function buildSystemHealth(findings: Finding[], readings: SystemReadings): SystemHealth[] {
  return SYSTEM_ORDER.map((key) => {
    const sysFindings = findings.filter((f) => systemOfFinding(f) === key);
    const sysReadings = readingsOf(key, readings);
    return {
      key,
      status: statusOf(sysFindings, sysReadings),
      readings: sysReadings,
      findings: sysFindings,
    };
  });
}

const SEVERITY_RANK: Record<SystemStatus, number> = { critical: 3, warn: 2, ok: 1, na: 0 };

/** Trạng thái tổng = hệ NẶNG nhất (na nếu mọi hệ đều na). Cho badge đầu màn. */
export function overallSystemStatus(systems: SystemHealth[]): SystemStatus {
  return systems.reduce<SystemStatus>(
    (worst, s) => (SEVERITY_RANK[s.status] > SEVERITY_RANK[worst] ? s.status : worst),
    'na',
  );
}
