import { ToolDefinition, ToolReading } from '../types';
import { IVehicleIO, VehicleSnapshot } from '../platform/types';

/**
 * vehicle.getSpeed/getRPM/... (docs/nori-agent-plan.md mục 6) - đọc VehicleContext (hoặc
 * MockVehicleAdapter khi test). Mỗi tool trả `age_seconds` để Nori nói được "68 km/h, 2 giây
 * trước" thay vì trình bày như tức thời tuyệt đối, hoặc trạng thái "unavailable" có cấu trúc
 * khi BLE mất kết nối thay vì throw lỗi.
 */

function reading<K extends keyof VehicleSnapshot>(
  vehicleIO: IVehicleIO,
  key: K,
  valueKey: string,
): ToolReading<Record<string, VehicleSnapshot[K]>> {
  if (!vehicleIO.isConnected()) {
    return { status: 'unavailable', reason: 'ble_disconnected' };
  }
  const snapshot = vehicleIO.getSnapshot();
  if (!snapshot) {
    return { status: 'unavailable', reason: 'no_data_yet' };
  }
  return {
    status: 'ok',
    [valueKey]: snapshot[key],
    age_seconds: Math.max(0, Math.round((Date.now() - snapshot.timestamp) / 1000)),
  } as ToolReading<Record<string, VehicleSnapshot[K]>>;
}

const NO_INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false } as const;

export function buildVehicleTools(vehicleIO: IVehicleIO): ToolDefinition[] {
  return [
    {
      name: 'vehicle.getLiveData',
      description: 'Lấy toàn bộ snapshot dữ liệu sống của xe (tốc độ, vòng tua, nhiệt độ nước làm mát, mức nhiên liệu, điện áp ắc-quy) tại thời điểm gần nhất OBD đọc được.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        if (!vehicleIO.isConnected()) return { status: 'unavailable', reason: 'ble_disconnected' };
        const snapshot = vehicleIO.getSnapshot();
        if (!snapshot) return { status: 'unavailable', reason: 'no_data_yet' };
        return {
          status: 'ok',
          rpm: snapshot.rpm,
          speed_kmh: snapshot.speedKmh,
          coolant_temp_c: snapshot.coolantTempC,
          fuel_level_pct: snapshot.fuelLevelPct,
          battery_voltage: snapshot.controlModuleVoltage,
          age_seconds: Math.max(0, Math.round((Date.now() - snapshot.timestamp) / 1000)),
        };
      },
    },
    {
      name: 'vehicle.getSpeed',
      description: 'Lấy tốc độ hiện tại của xe (km/h).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        return reading(vehicleIO, 'speedKmh', 'speed_kmh');
      },
    },
    {
      name: 'vehicle.getRPM',
      description: 'Lấy vòng tua máy hiện tại (RPM).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        return reading(vehicleIO, 'rpm', 'rpm');
      },
    },
    {
      name: 'vehicle.getCoolant',
      description: 'Lấy nhiệt độ nước làm mát động cơ hiện tại (°C).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        return reading(vehicleIO, 'coolantTempC', 'coolant_temp_c');
      },
    },
    {
      name: 'vehicle.getFuelLevel',
      description: 'Lấy mức nhiên liệu hiện tại (%).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        return reading(vehicleIO, 'fuelLevelPct', 'fuel_level_pct');
      },
    },
    {
      name: 'vehicle.getBatteryVoltage',
      description: 'Lấy điện áp ắc-quy/hệ thống điện hiện tại (V).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        return reading(vehicleIO, 'controlModuleVoltage', 'battery_voltage');
      },
    },
    {
      name: 'vehicle.readDTC',
      description: 'Đọc mã lỗi (DTC) thô hiện có trên xe qua OBD. Trả về danh sách mã, chưa giải nghĩa - dùng knowledge.explainDTC để giải nghĩa từng mã.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        if (!vehicleIO.isConnected()) return { status: 'unavailable', reason: 'ble_disconnected' };
        const codes = await vehicleIO.readDtcCodes();
        return { status: 'ok', codes, age_seconds: 0 };
      },
    },
    {
      name: 'vehicle.getReadiness',
      description: 'Đọc trạng thái đèn check engine (MIL) và các monitor khí thải sẵn sàng/chưa sẵn sàng (Mode 01 PID 01) - dùng để trả lời câu hỏi kiểu "xe có đủ điều kiện đăng kiểm không". Không giải nghĩa DTC, dùng knowledge.explainDTC riêng cho việc đó.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        if (!vehicleIO.isConnected()) return { status: 'unavailable', reason: 'ble_disconnected' };
        const readiness = await vehicleIO.readReadinessStatus();
        if (!readiness) return { status: 'unavailable', reason: 'no_data_yet' };
        return {
          status: 'ok',
          mil_on: readiness.milOn,
          dtc_count: readiness.dtcCount,
          ignition_type: readiness.ignitionType,
          monitors: readiness.monitors.filter((m) => m.supported).map((m) => ({ key: m.key, ready: m.ready })),
          age_seconds: 0,
        };
      },
    },
  ];
}
