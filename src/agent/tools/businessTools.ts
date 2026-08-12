import * as Location from 'expo-location';
import { ToolDefinition } from '../types';
import { NoteDriApi } from '../NoteDriApi';
import { PermissionManager } from '../../services/permissions/PermissionManager';
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
      name: 'maintenance.expenseSummary',
      description: 'Lấy tổng chi phí BẢO DƯỠNG/SỬA CHỮA (và xăng, để so sánh) trong 30 ngày gần nhất - vd "tổng tiền bảo dưỡng tháng trước", "tháng này tốn bao nhiêu tiền sửa xe". Khác với expense.summary (chỉ tính xăng).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const data = await NoteDriApi.getCostSummary(ctx.vehicleId, 30);
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
      // MỚI (rà soát tài liệu 2026-08-12): backend đã có sẵn `/vehicles/{id}/day-summary` từ
      // trước, viết riêng cho đúng câu hỏi này (xem comment VehicleController::daySummary), nhưng
      // chưa tool nào gọi tới - agent phải chắp vá từ vehicle.getTripToday/expense.summary rời
      // rạc. `day` giới hạn 'today'/'yesterday' (không phải chuỗi ngày tự do) để LLM không tự
      // tính/bịa ngày sai múi giờ.
      name: 'vehicle.getDaySummary',
      description: 'Tổng kết hoạt động của xe trong 1 NGÀY cụ thể (hôm nay hoặc hôm qua): chi phí xăng/bảo dưỡng, số chuyến và quãng đường GPS, điểm lái xe OBD2 (nếu Premium) - dùng cho câu hỏi kiểu "hôm qua xe tôi thế nào", "hôm nay xe chạy sao rồi". Khác vehicle.getTripToday (chỉ có GPS) và expense.summary (chỉ có chi phí xăng theo tháng) - tool này gộp đủ trong đúng 1 ngày.',
      authority: 'read-only',
      inputSchema: {
        type: 'object',
        properties: {
          day: {
            type: 'string',
            enum: ['today', 'yesterday'],
            description: 'Ngày cần tổng kết: "today" (hôm nay) hoặc "yesterday" (hôm qua). Mặc định "yesterday" khi user không nói rõ.',
          },
        },
        additionalProperties: false,
      },
      async execute(input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const day: 'today' | 'yesterday' = (input as any)?.day === 'today' ? 'today' : 'yesterday';
        const data = await NoteDriApi.getDaySummary(ctx.vehicleId, day);
        if (!data) return { status: 'unavailable', reason: 'no_data' };
        return { status: 'ok', day, ...data, age_seconds: 0 };
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
        const { granted } = await PermissionManager.requestLocationForeground();
        if (!granted) {
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
    {
      name: 'ev.findNearbyChargingStations',
      description: 'Tìm trạm sạc xe điện gần vị trí hiện tại của người dùng - dùng cho câu hỏi kiểu "tìm trạm sạc gần đây". Chỉ có ý nghĩa với xe điện. Đây là tính năng Premium.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        // Cùng quy tắc GPS như fuel.findNearbyStations (mục 4 kế hoạch): toạ độ lấy TẠI ĐÂY,
        // không bao giờ đi qua LLM.
        const { granted } = await PermissionManager.requestLocationForeground();
        if (!granted) {
          return { status: 'unavailable', reason: 'location_permission_denied' };
        }

        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const stations = await NoteDriApi.findNearbyChargingStations(loc.coords.latitude, loc.coords.longitude);
          return { status: 'ok', stations, age_seconds: 0 };
        } catch (err) {
          if (isPremiumRequiredError(err)) {
            return { status: 'unavailable', reason: 'premium_required' };
          }
          return { status: 'unavailable', reason: 'location_or_network_error' };
        }
      },
    },
    {
      name: 'vehicle.getLifetimeCost',
      description: 'Lấy TỔNG chi phí xăng + bảo dưỡng từ trước đến giờ (toàn bộ vòng đời xe, không giới hạn theo ngày/tháng) và chi phí trung bình mỗi km - dùng cho câu hỏi kiểu "tổng cộng xe tôi tốn bao nhiêu tiền từ trước tới giờ". Khác với expense.summary (chỉ xăng, theo tháng) và maintenance.expenseSummary (30 ngày gần nhất).',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const data = await NoteDriApi.getLifetimeCost(ctx.vehicleId);
        return { status: 'ok', ...data, age_seconds: 0 };
      },
    },
    {
      name: 'fuel.predictNextRefuel',
      description: 'Dự đoán khi nào cần đổ xăng/sạc điện lần tiếp theo (còn bao nhiêu km/ngày, mốc ODO dự kiến, chi phí ước tính) dựa trên lịch sử đổ gần đây - dùng cho câu hỏi kiểu "bao giờ tôi phải đổ xăng tiếp", "còn bao xa thì hết xăng". Cần ít nhất 2 lần đổ có ghi ODO mới dự đoán được.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        const prediction = await NoteDriApi.getFuelPrediction(ctx.vehicleId ?? undefined);
        if (!prediction) return { status: 'unavailable', reason: 'not_enough_refuel_history' };
        return { status: 'ok', ...prediction, age_seconds: 0 };
      },
    },
    {
      // MỚI: câu "đổ 1 triệu tiền xăng" (chỉ có tổng tiền, chưa rõ số lít/đơn giá) trước đây
      // KHÔNG có cách tra giá THẬT theo loại xăng - LLM chỉ có thể hỏi lại user hoặc (rủi ro) tự
      // bịa giá. Tool này lộ đúng bảng giá tham chiếu thật app đã có sẵn (cùng nguồn
      // FuelPricesScreen.tsx dùng) để fuel.create (writeTools.ts) gọi TRƯỚC khi hỏi loại xăng.
      name: 'fuel.getCurrentPrices',
      description: 'Lấy danh sách LOẠI NHIÊN LIỆU đang bán (RON95-III, RON95-V, E5 RON92, Dầu DO...) kèm GIÁ HIỆN TẠI (đồng/lít) theo bảng giá tham chiếu thật của app - gọi tool này TRƯỚC khi ghi đổ xăng (fuel.create) nếu user CHỈ nói tổng số tiền (vd "đổ 1 triệu tiền xăng") mà CHƯA cho biết số lít hoặc đơn giá cụ thể, để hỏi user chọn loại xăng (hoặc mặc định loại đầu tiên nếu user không quan tâm) rồi tự tính ra số lít từ tổng tiền/giá - TUYỆT ĐỐI không tự bịa giá khi chưa gọi tool này.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        const types = await NoteDriApi.getFuelTypesWithPrices();
        if (types.length === 0) return { status: 'unavailable', reason: 'no_fuel_price_data' };
        return { status: 'ok', fuel_types: types, age_seconds: 0 };
      },
    },
    {
      // MỚI: câu hỏi thời tiết trước đây rơi hẳn vào LLM (không có dữ liệu thời tiết thật để
      // tra) dù app đã có sẵn endpoint `/weather` thật (đang dùng ở widget Trang chủ/Cockpit) -
      // bọc thành tool đọc-thẳng qua LocalIntentMatcher, KHÔNG cần LLM (mục 4 kế hoạch: câu hỏi
      // khớp mẫu rõ ràng trả lời thẳng từ tool_result, rẻ hơn + không có chỗ để bịa số).
      name: 'weather.getCurrent',
      description: 'Lấy thời tiết hiện tại (nhiệt độ, chất lượng không khí) tại vị trí GPS hiện tại của người dùng - dùng cho câu hỏi kiểu "thời tiết hôm nay thế nào", "ngoài trời có mưa không", "nhiệt độ ngoài trời bao nhiêu".',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute() {
        // Cùng quy tắc GPS như fuel.findNearbyStations (mục 4 kế hoạch): toạ độ lấy TẠI ĐÂY,
        // không bao giờ đi qua LLM.
        const { granted } = await PermissionManager.requestLocationForeground();
        if (!granted) {
          return { status: 'unavailable', reason: 'location_permission_denied' };
        }

        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const data = await NoteDriApi.getWeather(loc.coords.latitude, loc.coords.longitude);
          if (!data || data.temp == null) return { status: 'unavailable', reason: 'weather_no_data' };
          return { status: 'ok', ...data, age_seconds: 0 };
        } catch {
          return { status: 'unavailable', reason: 'location_or_network_error' };
        }
      },
    },
    {
      name: 'vehicle.getFuelConsumptionHealth',
      description: 'Xe có đang tốn xăng/nhiên liệu bất thường so với mức bình thường của chính xe này (hoặc mức hãng công bố) không - dùng cho câu hỏi kiểu "xe tôi có tốn xăng hơn bình thường không", "tiêu hao nhiên liệu có ổn không". Không áp dụng cho xe điện.',
      authority: 'read-only',
      inputSchema: NO_INPUT_SCHEMA,
      async execute(_input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const organ = await NoteDriApi.getFuelConsumptionOrgan(ctx.vehicleId);
        if (!organ) return { status: 'unavailable', reason: 'not_enough_data' };
        if (organ.status === 'na') return { status: 'unavailable', reason: 'not_applicable_ev' };
        return {
          status: 'ok',
          verdict: organ.verdict,
          detail: organ.detail,
          note: organ.note,
          health_status: organ.status,
          age_seconds: 0,
        };
      },
    },
  ];
}
