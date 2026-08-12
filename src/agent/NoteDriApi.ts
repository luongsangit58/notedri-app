import { vehiclesApi } from '../api/vehicles';
import { gpsTripsApi } from '../api/gpsTrips';
import { odometerApi } from '../api/odometer';
import { dashboardApi } from '../api/dashboard';
import { remindersApi } from '../api/reminders';
import { obdApi } from '../api/obd';
import { refuelsApi } from '../api/refuels';
import { fuelTypesApi } from '../api/fuelTypes';
import client from '../api/client';

/**
 * Lớp mỏng gọi lại src/api/*.ts hiện có (docs/nori-agent-plan.md mục 10.2) - KHÔNG viết API
 * client mới. Tool nào cần đọc/ghi dữ liệu nghiệp vụ sẽ gọi qua đây thay vì import thẳng
 * src/api/*.ts, để business tools không phụ thuộc chi tiết axios/route của từng module.
 *
 * 2 endpoint sau đã RÀ LẠI (2026-07-27) đối chiếu trực tiếp code backend
 * (DashboardController@index, GpsTripController@index) - không còn TODO:
 */
/** Ngày cục bộ (theo giờ máy user, KHÔNG qua toISOString() - lệch ngày quanh nửa đêm giờ VN
 *  UTC+7 vì toISOString() luôn quy về UTC) cách hôm nay `daysAgo` ngày, dạng YYYY-MM-DD. */
function localDateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const NoteDriApi = {
  async getHealthScore(vehicleId: number) {
    const res = await vehiclesApi.health(vehicleId);
    return res.data;
  },

  /**
   * Rút riêng organ 'tieu_thu' (tiêu thụ nhiên liệu so với baseline/mức hãng công bố) từ
   * `/vehicles/{id}/health` (VehicleHealthService::consumptionOrgan) - MỚI (2026-07-28) cho
   * tool `vehicle.getFuelConsumptionHealth`, đóng câu hỏi "xe tôi có tốn xăng hơn bình thường
   * không". Dữ liệu này ĐÃ có sẵn trong payload health (dùng chung nguồn với
   * vehicle.getHealthScore/getRecentIssues), chỉ trích ra 1 organ cụ thể thay vì bắt LLM tự mò
   * trong object health_score/organs chung chung.
   */
  async getFuelConsumptionOrgan(vehicleId: number) {
    const res = await vehiclesApi.health(vehicleId);
    const h: any = res.data?.data ?? res.data ?? {};
    const organs: any[] = Array.isArray(h?.organs) ? h.organs : [];
    return organs.find((o) => o.key === 'tieu_thu') ?? null;
  },

  /**
   * `/dashboard` (DashboardController@index) KHÔNG có endpoint expense riêng - trả toàn bộ
   * payload trang chủ (vehicles, health_report, suggestions...). Chỉ lấy 3 field chi phí
   * NHIÊN LIỆU (FuelCalculator::fuelSummary: tong_tien/tong_lit/so_lan) - KHÔNG gộp chi phí
   * bảo dưỡng (đó là CostSummary::lifetime(), hiện chỉ lộ qua ReportController@show theo
   * năm, Premium-gated cho năm cũ - không phù hợp làm tool đọc nhanh). Đặt tên tool
   * "expense.summary" nhưng phải nói rõ với LLM đây là CHI PHÍ XĂNG (xem description ở
   * businessTools.ts) để không lỡ trả lời như tổng chi phí xe.
   */
  async getFuelExpenseSummary(vehicleId?: number) {
    const res = await dashboardApi.get(vehicleId);
    const d = res.data?.data ?? {};
    return {
      this_month: d.this_month ?? null,
      last_month: d.last_month ?? null,
      all_time: d.all_time ?? null,
    };
  },

  /**
   * `/dashboard` đã trả sẵn `prediction` (FuelCalculator::predictNextRefuel) nhưng trước đây
   * chỉ NoteDriApi.getFuelExpenseSummary() gọi endpoint này và loại bỏ field này - MỚI
   * (2026-07-28) tách riêng thành tool `fuel.predictNextRefuel` theo gap đã ghi nhận trong
   * docs/nori-agent-qa-coverage.md. `prediction` là `null` khi xe chưa đủ >= 2 lần đổ xăng có
   * ODO - giữ nguyên `null` để tool trả `status: unavailable` thay vì bịa số.
   */
  async getFuelPrediction(vehicleId?: number) {
    const res = await dashboardApi.get(vehicleId);
    return res.data?.data?.prediction ?? null;
  },

  /**
   * `/vehicles/{id}/day-summary?at=YYYY-MM-DD` (VehicleController::daySummary, backend) - viết
   * riêng CHO Nori Agent trả lời "hôm qua/hôm nay xe tôi thế nào" (chi phí + chuyến GPS + sức
   * khoẻ + OBD2 nếu Premium, tính SỐNG mỗi lần gọi). Trước đây (rà soát tài liệu 2026-08-12)
   * endpoint này tồn tại ở backend nhưng KHÔNG tool nào gọi tới - agent phải chắp vá câu trả lời
   * từ getTripToday/expense.summary rời rạc. `day` chỉ nhận 'today'/'yesterday' (không phải
   * chuỗi ngày tự do) - tránh LLM tự tính/bịa ngày sai lệch múi giờ.
   */
  async getDaySummary(vehicleId: number, day: 'today' | 'yesterday' = 'yesterday') {
    const at = localDateOffset(day === 'yesterday' ? 1 : 0);
    const res = await vehiclesApi.daySummary(vehicleId, at);
    return res.data?.data ?? null;
  },

  async getUpcomingReminders(vehicleId: number) {
    const res = await remindersApi.list(vehicleId);
    return res.data;
  },

  /**
   * `/gps/trips` (GpsTripController@index) không có filter "hôm nay" phía server - chỉ phân
   * trang 20 bản ghi/trang, sắp mới nhất trước. Vì luôn sắp giảm dần theo started_at, chuyến
   * của HÔM NAY (nếu có) chắc chắn nằm ở trang 1 - tự lọc theo ngày ở đây thay vì trả nguyên
   * payload phân trang cho LLM tự đoán ngày (rủi ro sai lệch timezone/định dạng).
   */
  async getTodayTrips(vehicleId: number) {
    const res = await gpsTripsApi.trips(vehicleId, 1);
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayTrips = res.data.data.filter((t) => t.started_at.slice(0, 10) === todayStr);
    return {
      trips_count: todayTrips.length,
      total_km: Math.round(todayTrips.reduce((sum, t) => sum + t.distance_km, 0) * 10) / 10,
      total_driving_seconds: todayTrips.reduce((sum, t) => sum + t.driving_time_seconds, 0),
    };
  },

  async getCurrentOdometer(vehicleId: number) {
    const res = await odometerApi.list(vehicleId, 1);
    return res.data;
  },

  /**
   * `/obd2/sessions/history` (Premium - cả nhóm `obd2/*` đều gate `premium`) - dùng cho
   * vehicle.getRecentIssues(), TÁI DÙNG đúng nguồn `noriSummary.ts` (Nori mascot ở Home)
   * đang dùng, KHÔNG tự query raw DTC events rồi diễn giải lại (rà soát theo góp ý: đã có
   * sẵn logic mood/so sánh tuần ở src/services/nori/, không nên xây lại).
   */
  async getSessionHistory(vehicleId: number, days = 30) {
    const res = await obdApi.historySessions(vehicleId, days);
    return res.data.data;
  },

  /** `/refuels/nearby-stations` (Premium, cờ `gas_finder`) - lat/lng lấy ở tool layer qua
   * expo-location, KHÔNG bao giờ đi qua LLM (mục 4: không gửi GPS nguyên văn cho LLM). */
  async findNearbyFuelStations(lat: number, lng: number) {
    const res = await refuelsApi.nearbyStations(lat, lng);
    return (res.data as any)?.stations ?? (res.data as any)?.data ?? [];
  },

  /** `/refuels/nearby-charging` (Premium, cùng cờ `gas_finder`) - MỚI (2026-07-28), đã có sẵn
   * cả route backend (`RefuelController@nearbyCharging`) và hàm client `refuelsApi.nearbyCharging`
   * từ trước, chỉ chưa được bọc thành tool cho Nori. Cùng quy tắc GPS: lấy TẠI tool layer,
   * không đi qua LLM. */
  async findNearbyChargingStations(lat: number, lng: number) {
    const res = await refuelsApi.nearbyCharging(lat, lng);
    return (res.data as any)?.stations ?? [];
  },

  /**
   * `/vehicles/{id}/cost-summary` - MỚI (2026-07-27), thêm sau khi user test thật hỏi "tổng
   * tiền bảo dưỡng tháng trước" và KHÔNG có tool nào trả lời được (grounding validator đã chặn
   * đúng số bịa của LLM, nhưng vẫn không giúp gì được user - thiếu tool thật). Tái dùng
   * CostSummary::since() (backend) - nguồn sự thật chi phí đã dùng chung ở nhiều nơi khác.
   */
  async getCostSummary(vehicleId: number, days = 30) {
    const res = await vehiclesApi.costSummary(vehicleId, days);
    return res.data.data;
  },

  /**
   * `/vehicles/{id}/cost-summary?scope=lifetime` (VehicleController@costSummary) - MỚI
   * (2026-07-28) cho `vehicle.getLifetimeCost`, đóng gap "tổng chi phí xe từ trước tới giờ"
   * nêu trong docs/nori-agent-qa-coverage.md. Backend chỉ thêm 1 nhánh param lên
   * CostSummary::lifetime() đã được 3 nơi khác dùng production từ trước (không phải code mới
   * chưa kiểm chứng).
   */
  async getLifetimeCost(vehicleId: number) {
    const res = await vehiclesApi.costSummaryLifetime(vehicleId);
    return res.data.data;
  },

  /**
   * `POST /vehicles/{id}/odometer` (OdometerController@store) - Phase 2 ghi ODO (mục 6/7).
   * Backend có thể trả 422 với `message` tiếng Việt cụ thể (vd "ODO nhỏ hơn mốc đã biết") khi
   * số liệu không hợp lệ - ném lại nguyên lỗi để writeTools.ts bắt và trả reason cho LLM, thay
   * vì nuốt lỗi ở đây.
   */
  async createOdometerReading(vehicleId: number, data: { odometer: number; ngay?: string; ghi_chu?: string }) {
    const res = await odometerApi.create(vehicleId, data);
    return res.data;
  },

  /** `/weather` (đã dùng ở HomeScreen.tsx/CockpitWeather.tsx qua axios `client` trực tiếp, chưa
   * có wrapper NoteDriApi) - MỚI cho tool `weather.getCurrent`: endpoint thời tiết thật đã có sẵn
   * từ trước, chỉ chưa được bọc thành tool cho Nori nên câu hỏi thời tiết trước đây rơi vào LLM
   * (không có dữ liệu thật, chỉ bịa hoặc từ chối trả lời) - dữ liệu thật thì không cần LLM. */
  async getWeather(lat: number, lng: number) {
    const res = await client.get('/weather', { params: { lat, lng } });
    return (res.data as any)?.data ?? null;
  },

  /**
   * `POST /refuels` (RefuelController@store, validateData()) - Phase 2 ghi đổ xăng (mục 6/7).
   * vehicle_id gắn ở đây (từ ToolContext), KHÔNG để LLM tự chọn xe. Các field còn lại đều
   * nullable phía backend (FuelCalculator::autoCalc tự suy 1 trong 3: lít/giá/tổng nếu có đủ 2).
   * fuel_type_id/fuel_type (MỚI) - CÙNG 2 field màn AddRefuelScreen.tsx đã gửi lâu nay, chỉ chưa
   * bọc cho Nori - cho phép fuel.create() ghi kèm loại xăng khi tra được giá qua
   * fuel.getCurrentPrices() (xem businessTools.ts).
   */
  async createRefuel(
    vehicleId: number,
    data: {
      ngay?: string;
      odometer?: number;
      so_lit?: number;
      gia_lit?: number;
      tong_tien?: number;
      cay_xang?: string;
      is_full_tank?: boolean;
      ghi_chu?: string;
      fuel_type_id?: number;
      fuel_type?: string;
    },
  ) {
    const res = await refuelsApi.create({ vehicle_id: vehicleId, ...data });
    return res.data;
  },

  /**
   * `/fuel-types` (đã dùng ở AddRefuelScreen.tsx/FuelPricesScreen.tsx qua `fuelTypesApi.list()`)
   * - MỚI cho tool `fuel.getCurrentPrices`: câu hỏi "đổ 1 triệu tiền xăng" (chỉ có tổng tiền,
   * chưa rõ số lít/đơn giá) trước đây không có cách nào tra giá THẬT theo loại xăng, LLM chỉ có
   * thể hỏi lại user hoặc (rủi ro) tự bịa giá - giờ tra đúng bảng giá tham chiếu thật app đã có,
   * cùng nguồn `gia_hien_tai` màn hình Giá xăng (FuelPricesScreen.tsx) hiển thị. Chỉ trả loại
   * ĐANG kích hoạt và có giá (`kich_hoat && gia_hien_tai != null`) - loại chưa có giá không giúp
   * gì được cho việc tính ngược số lít.
   */
  async getFuelTypesWithPrices() {
    const res = await fuelTypesApi.list();
    const types: any[] = res.data?.data ?? res.data ?? [];
    return types
      .filter((t) => t.kich_hoat && t.gia_hien_tai != null)
      .map((t) => ({ id: t.id, ten: t.ten, nhom: t.nhom, gia_hien_tai: t.gia_hien_tai }));
  },
};
