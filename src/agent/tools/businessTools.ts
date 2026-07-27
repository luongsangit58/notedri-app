import { ToolDefinition } from '../types';
import { NoteDriApi } from '../NoteDriApi';

const NO_INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false } as const;

/**
 * expense.summary, maintenance.getUpcoming... (docs/nori-agent-plan.md mục 6) - gọi lại
 * NoteDriApi (wrapper của src/api/*.ts), KHÔNG viết API client mới. Đã rà lại
 * (2026-07-27) đối chiếu code backend thật - xem chú thích ở từng hàm NoteDriApi tương ứng.
 */
export function buildBusinessTools(): ToolDefinition[] {
  return [
    {
      name: 'vehicle.getHealthScore',
      description: 'Lấy điểm sức khoẻ tổng quát của xe (health score) do backend tính từ lịch sử bảo dưỡng/chẩn đoán.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const data = await NoteDriApi.getHealthScore(ctx.vehicleId);
        return { status: 'ok', ...data, age_seconds: 0 };
      },
    },
    {
      name: 'vehicle.getTripToday',
      description: 'Lấy tổng quãng đường và thời gian lái xe TRONG NGÀY HÔM NAY (tính từ dữ liệu hành trình GPS đã ghi nhận) để trả lời câu hỏi kiểu "hôm nay chạy bao nhiêu km".',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const data = await NoteDriApi.getTodayTrips(ctx.vehicleId);
        return { status: 'ok', ...data, age_seconds: 0 };
      },
    },
    {
      name: 'vehicle.getCurrentODO',
      description: 'Lấy số công-tơ-mét (odometer) gần nhất đã ghi nhận cho xe.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const data = await NoteDriApi.getCurrentOdometer(ctx.vehicleId);
        return { status: 'ok', readings: data, age_seconds: 0 };
      },
    },
    {
      name: 'expense.summary',
      description: 'Lấy tổng hợp chi phí NHIÊN LIỆU (xăng/điện) của xe theo tháng này/tháng trước/toàn bộ thời gian - vd "tháng này tốn bao nhiêu tiền xăng". KHÔNG bao gồm chi phí bảo dưỡng/sửa chữa.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        const data = await NoteDriApi.getFuelExpenseSummary(ctx.vehicleId ?? undefined);
        return { status: 'ok', ...data, age_seconds: 0 };
      },
    },
    {
      name: 'maintenance.getUpcoming',
      description: 'Lấy danh sách nhắc nhở bảo dưỡng/giấy tờ sắp đến hạn của xe.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const data = await NoteDriApi.getUpcomingReminders(ctx.vehicleId);
        return { status: 'ok', reminders: data, age_seconds: 0 };
      },
    },
  ];
}
