import { vehiclesApi } from '../api/vehicles';
import { gpsTripsApi } from '../api/gpsTrips';
import { odometerApi } from '../api/odometer';
import { dashboardApi } from '../api/dashboard';
import { remindersApi } from '../api/reminders';
import { obdApi } from '../api/obd';
import { refuelsApi } from '../api/refuels';

/**
 * Lớp mỏng gọi lại src/api/*.ts hiện có (docs/nori-agent-plan.md mục 10.2) - KHÔNG viết API
 * client mới. Tool nào cần đọc/ghi dữ liệu nghiệp vụ sẽ gọi qua đây thay vì import thẳng
 * src/api/*.ts, để business tools không phụ thuộc chi tiết axios/route của từng module.
 *
 * 2 endpoint sau đã RÀ LẠI (2026-07-27) đối chiếu trực tiếp code backend
 * (DashboardController@index, GpsTripController@index) - không còn TODO:
 */
export const NoteDriApi = {
  async getHealthScore(vehicleId: number) {
    const res = await vehiclesApi.health(vehicleId);
    return res.data;
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
   * `POST /vehicles/{id}/odometer` (OdometerController@store) - Phase 2 ghi ODO (mục 6/7).
   * Backend có thể trả 422 với `message` tiếng Việt cụ thể (vd "ODO nhỏ hơn mốc đã biết") khi
   * số liệu không hợp lệ - ném lại nguyên lỗi để writeTools.ts bắt và trả reason cho LLM, thay
   * vì nuốt lỗi ở đây.
   */
  async createOdometerReading(vehicleId: number, data: { odometer: number; ngay?: string; ghi_chu?: string }) {
    const res = await odometerApi.create(vehicleId, data);
    return res.data;
  },

  /**
   * `POST /refuels` (RefuelController@store, validateData()) - Phase 2 ghi đổ xăng (mục 6/7).
   * vehicle_id gắn ở đây (từ ToolContext), KHÔNG để LLM tự chọn xe. Các field còn lại đều
   * nullable phía backend (FuelCalculator::autoCalc tự suy 1 trong 3: lít/giá/tổng nếu có đủ 2).
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
    },
  ) {
    const res = await refuelsApi.create({ vehicle_id: vehicleId, ...data });
    return res.data;
  },
};
