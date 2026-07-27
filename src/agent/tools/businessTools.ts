import * as Location from 'expo-location';
import { ToolDefinition } from '../types';
import { NoteDriApi } from '../NoteDriApi';
import { groupSessionsByDay, compareWeeks } from '../../services/obd/sessionTrend';
import { noriMoodFromScore } from '../../services/nori/nori';

const NO_INPUT_SCHEMA = { type: 'object', properties: {}, additionalProperties: false } as const;

/** `/obd2/*` và `/refuels/nearby-stations` đều gate Premium (`middleware('premium')`/
 * `canUse('gas_finder')`) - backend trả 403 kèm `premium_required: true`. Bắt riêng để tool
 * trả trạng thái có cấu trúc ("cần Premium") thay vì rơi vào nhánh lỗi chung chung
 * "tool_execution_error" của ToolExecutor (mục 6: unavailable phải có `reason` rõ ràng). */
function isPremiumRequiredError(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  const data = (err as any)?.response?.data;
  return status === 403 && data?.premium_required === true;
}

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
    {
      name: 'vehicle.getRecentIssues',
      description: 'Xe có vấn đề gì đáng chú ý gần đây không, và so sánh tình trạng lái xe tuần này với tuần trước - dùng cho câu hỏi kiểu "hôm qua/tuần qua xe tôi có vấn đề gì không", "xe tôi dạo này thế nào". TÁI DÙNG đúng logic "tâm trạng Nori" hiển thị ở Trang chủ (mood/organ nổi bật nhất), không phải nguồn riêng.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };

        const health = await NoteDriApi.getHealthScore(ctx.vehicleId);
        const h: any = health?.data ?? health ?? {};
        const total: number | null = h?.score?.total ?? (h?.health_score != null ? Number(h.health_score) : null);
        const organs: any[] = Array.isArray(h?.organs) ? h.organs : [];
        const hasUrgentOrgan = organs.some((o) => o.status === 'urgent');
        const hasWarnOrgan = organs.some((o) => o.status === 'warn');
        const topIssue = organs.find((o) => o.status === 'urgent') ?? organs.find((o) => o.status === 'warn');
        const mood = noriMoodFromScore(total, hasUrgentOrgan, hasWarnOrgan);

        // So sánh tuần (mục Premium, xem NoteDriApi.getSessionHistory) - KHÔNG chặn cả tool
        // nếu thiếu Premium: vẫn trả được mood/topIssue (miễn phí) kèm ghi chú thiếu phần
        // so sánh tuần, thay vì trả unavailable toàn bộ chỉ vì 1 phần dữ liệu bị khoá.
        let weekComparison = null;
        let weekComparisonNote: string | null = null;
        try {
          const sessions = await NoteDriApi.getSessionHistory(ctx.vehicleId, 30);
          weekComparison = compareWeeks(groupSessionsByDay(sessions, 30));
          if (!weekComparison) weekComparisonNote = 'chưa đủ 14 ngày dữ liệu để so sánh tuần';
        } catch (err) {
          weekComparisonNote = isPremiumRequiredError(err)
            ? 'so sánh theo tuần là tính năng Premium'
            : 'không lấy được dữ liệu so sánh tuần';
        }

        return {
          status: 'ok',
          mood,
          health_score: total,
          top_issue: topIssue ? { label: topIssue.label, status: topIssue.status } : null,
          week_comparison: weekComparison,
          week_comparison_note: weekComparisonNote,
          age_seconds: 0,
        };
      },
    },
    {
      name: 'fuel.findNearbyStations',
      description: 'Tìm cây xăng gần vị trí hiện tại của người dùng (bán kính ~1.5km) - dùng cho câu hỏi kiểu "tìm cây xăng gần đây". Đây là tính năng Premium.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        // Toạ độ GPS lấy TẠI ĐÂY, không bao giờ đi qua LLM (mục 4 kế hoạch: không gửi vị trí
        // chính xác cho nhà cung cấp LLM bên thứ ba) - chỉ danh sách trạm (tên/địa chỉ) mới
        // được đưa vào tool_result để LLM diễn đạt lại.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return { status: 'unavailable', reason: 'location_permission_denied' };
        }

        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const stations = await NoteDriApi.findNearbyFuelStations(loc.coords.latitude, loc.coords.longitude);
          return { status: 'ok', stations, age_seconds: 0 };
        } catch (err) {
          if (isPremiumRequiredError(err)) {
            return { status: 'unavailable', reason: 'premium_required' };
          }
          return { status: 'unavailable', reason: 'location_or_network_error' };
        }
      },
    },
  ];
}
