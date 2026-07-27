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
};
