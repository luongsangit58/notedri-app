import dayjs from 'dayjs';
import { ToolDefinition } from '../types';
import { NoteDriApi } from '../NoteDriApi';

/**
 * Tool GHI dữ liệu (authority='mutating') - Phase 2 (theo yêu cầu 2026-07-27: "phase 2 tạm
 * thời xử lý cho Nori thực hiện ghi ODO và ghi đổ xăng thôi"). CHỈ 2 tool này - các mục Phase 2
 * khác trong plan (maintenance.create, vehicle.clearDTC, ocr.*) CHƯA làm, không suy rộng thêm.
 *
 * Cả 2 đều requiresConfirmation=true (mục 7: mutating PHẢI qua xác nhận UI trước khi ghi) -
 * ToolExecutor sẽ gọi confirmAction(summary) và CHỈ execute() nếu user đồng ý. Không dùng
 * LocalIntentMatcher cho 2 tool này (khác các tool đọc Phase 1): số liệu ghi vào là DỮ LIỆU
 * THẬT của xe, rủi ro parse sai câu tự nhiên thành số sai cao hơn nhiều so với chỉ trả lời câu
 * hỏi - để LLM parse (linh hoạt hơn regex) rồi con người xác nhận lại số cụ thể trước khi ghi.
 */

/** Bắt message tiếng Việt cụ thể backend trả về ở lỗi 422 (vd OdometerController: "ODO nhỏ hơn
 * mốc đã biết X km") - đúng pattern dùng khắp app (AddOdometerScreen.tsx, AddRefuelScreen.tsx),
 * để LLM diễn đạt lại lý do THẬT cho user thay vì "có lỗi xảy ra" chung chung. */
function backendErrorMessage(err: unknown): string | null {
  return (err as any)?.response?.data?.message ?? null;
}

function formatDateForSummary(ngay: string | undefined): string {
  return ngay ? `ngày ${ngay}` : 'hôm nay';
}

export function buildWriteTools(): ToolDefinition[] {
  return [
    {
      name: 'odometer.create',
      description:
        'GHI (tạo/cập nhật) số công-tơ-mét (odometer) hiện tại của xe - dùng khi user nói kiểu "ghi công-tơ-mét 15234 km", "cập nhật odo 20000". Chỉ gọi khi user đã cho số ODO cụ thể - nếu chưa có số, hỏi lại user trước, KHÔNG tự đoán.',
      authority: 'mutating',
      requiresConfirmation: true,
      inputSchema: {
        type: 'object',
        properties: {
          odometer: { type: 'integer', description: 'Số công-tơ-mét (km), ví dụ 15234' },
          ngay: { type: 'string', description: 'Ngày ghi nhận, định dạng YYYY-MM-DD. Bỏ trống nếu user không nói ngày cụ thể (mặc định hôm nay).' },
          ghi_chu: { type: 'string', description: 'Ghi chú thêm, nếu user có nói' },
        },
        required: ['odometer'],
        additionalProperties: false,
      },
      confirmationSummary(input) {
        const odo = input.odometer as number;
        const ngay = input.ngay as string | undefined;
        return `Ghi số công-tơ-mét: ${odo} km (${formatDateForSummary(ngay)}).`;
      },
      async execute(input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const odometer = Number(input.odometer);
        if (!Number.isFinite(odometer) || odometer < 0) {
          return { status: 'invalid_input', reason: 'missing_odometer' };
        }
        try {
          const data = await NoteDriApi.createOdometerReading(ctx.vehicleId, {
            odometer,
            ngay: input.ngay as string | undefined,
            ghi_chu: input.ghi_chu as string | undefined,
          });
          return { status: 'ok', ...data };
        } catch (err) {
          const message = backendErrorMessage(err);
          return message ? { status: 'rejected', reason: message } : { status: 'unavailable', reason: 'save_failed' };
        }
      },
    },
    {
      name: 'fuel.create',
      description:
        'GHI 1 lần đổ xăng mới cho xe - dùng khi user nói kiểu "ghi đổ xăng 5 lít hết 150 nghìn", "vừa đổ đầy bình 200 nghìn, giá 20 nghìn 1 lít". Backend yêu cầu ÍT NHẤT 2 TRONG 3 số: số lít (so_lit), đơn giá (gia_lit), tổng tiền (tong_tien) - nếu user chỉ cho 1 số (vd chỉ nói TỔNG TIỀN như "đổ 1 triệu tiền xăng", chưa nói số lít/đơn giá), TUYỆT ĐỐI KHÔNG tự bịa đơn giá - phải gọi tool fuel.getCurrentPrices TRƯỚC để lấy giá thật theo loại xăng, hỏi user muốn đổ loại nào (hoặc dùng loại đầu tiên trong danh sách làm mặc định nếu user nói không quan tâm/xăng gì cũng được), rồi gọi fuel.create với tong_tien + gia_lit (đơn giá lấy từ fuel.getCurrentPrices, không phải số tự đoán) kèm fuel_type_id/fuel_type tương ứng - KHÔNG cần tự tính số lít, backend tự suy ra.',
      authority: 'mutating',
      requiresConfirmation: true,
      inputSchema: {
        type: 'object',
        properties: {
          so_lit: { type: 'number', description: 'Số lít xăng đã đổ, nếu user có nói' },
          tong_tien: { type: 'number', description: 'Tổng số tiền đã trả (VNĐ), nếu user có nói' },
          gia_lit: { type: 'number', description: 'Đơn giá mỗi lít (VNĐ) - nếu user không nói rõ, lấy từ kết quả fuel.getCurrentPrices theo loại xăng đã chọn, KHÔNG tự bịa số' },
          fuel_type_id: { type: 'integer', description: 'id loại xăng (lấy từ kết quả fuel.getCurrentPrices) nếu đã xác định được loại xăng dùng để tra gia_lit' },
          fuel_type: { type: 'string', description: 'Tên loại xăng (vd "RON95-III"), lấy từ kết quả fuel.getCurrentPrices' },
          odometer: { type: 'integer', description: 'Số công-tơ-mét tại thời điểm đổ xăng, nếu user có nói' },
          ngay: { type: 'string', description: 'Ngày đổ xăng, định dạng YYYY-MM-DD. Bỏ trống nếu user không nói (mặc định hôm nay).' },
          is_full_tank: { type: 'boolean', description: 'true nếu user nói đổ đầy bình, false nếu đổ lửng/1 phần' },
          cay_xang: { type: 'string', description: 'Tên/địa điểm cây xăng, nếu user có nói' },
          ghi_chu: { type: 'string', description: 'Ghi chú thêm, nếu user có nói' },
        },
        required: [],
        additionalProperties: false,
      },
      confirmationSummary(input) {
        const parts: string[] = [];
        if (input.so_lit != null) parts.push(`${input.so_lit} lít`);
        if (input.tong_tien != null) parts.push(`${Number(input.tong_tien).toLocaleString('vi-VN')}đ`);
        if (input.gia_lit != null) parts.push(`đơn giá ${Number(input.gia_lit).toLocaleString('vi-VN')}đ/lít`);
        if (input.fuel_type) parts.push(`loại ${input.fuel_type}`);
        const amount = parts.length > 0 ? parts.join(', ') : 'chưa rõ số lượng';
        const tank = input.is_full_tank === true ? ' - đổ đầy bình' : input.is_full_tank === false ? ' - đổ lửng' : '';
        return `Ghi đổ xăng: ${amount}${tank} (${formatDateForSummary(input.ngay as string | undefined)}).`;
      },
      async execute(input, ctx) {
        if (!ctx.vehicleId) return { status: 'unavailable', reason: 'no_active_vehicle' };
        const soLit = input.so_lit != null ? Number(input.so_lit) : undefined;
        const giaLit = input.gia_lit != null ? Number(input.gia_lit) : undefined;
        const tongTien = input.tong_tien != null ? Number(input.tong_tien) : undefined;
        // Backend (RefuelController::validateData) BẮT BUỘC >= 2 trong 3 số này - kiểm tra
        // TRƯỚC khi hỏi xác nhận, tránh hiện hộp xác nhận cho 1 lần ghi chắc chắn sẽ bị 422.
        const providedCount = [soLit, giaLit, tongTien].filter((v) => v != null && Number.isFinite(v) && v > 0).length;
        if (providedCount < 2) {
          return { status: 'invalid_input', reason: 'need_at_least_2_of_3_amounts' };
        }
        try {
          const data = await NoteDriApi.createRefuel(ctx.vehicleId, {
            // Khác odometer.create (backend tự mặc định "hôm nay" khi thiếu `ngay`),
            // RefuelController::validateData() bắt `ngay` là REQUIRED - thiếu sẽ luôn 422 "The
            // ngay field is required." Bug thật bắt được lúc test (curl không truyền `ngay`,
            // đúng tình huống LLM bỏ trống theo description cũ) - phải tự điền mặc định ở tầng
            // app, không thể tin backend tự lo như odometer.
            ngay: (input.ngay as string | undefined) ?? dayjs().format('YYYY-MM-DD'),
            odometer: input.odometer != null ? Number(input.odometer) : undefined,
            so_lit: soLit,
            gia_lit: giaLit,
            tong_tien: tongTien,
            fuel_type_id: input.fuel_type_id != null ? Number(input.fuel_type_id) : undefined,
            fuel_type: input.fuel_type as string | undefined,
            cay_xang: input.cay_xang as string | undefined,
            is_full_tank: input.is_full_tank as boolean | undefined,
            ghi_chu: input.ghi_chu as string | undefined,
          });
          return { status: 'ok', ...data };
        } catch (err) {
          const message = backendErrorMessage(err);
          return message ? { status: 'rejected', reason: message } : { status: 'unavailable', reason: 'save_failed' };
        }
      },
    },
  ];
}
