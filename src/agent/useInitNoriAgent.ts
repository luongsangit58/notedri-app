import { useEffect, useRef } from 'react';
import { useNoriAgentStore } from '../store/noriAgentStore';
import { useObdSessionStore } from '../store/obdSessionStore';
import { useSelectedVehicleStore } from '../store/selectedVehicleStore';
import { useVehicles } from '../hooks/useVehicles';
import { useAuthStore } from '../store/authStore';

/**
 * Khởi tạo NoriAgent (mục 10.1) - tách ra dùng chung cho CẢ `NoriChatScreen` (trang đầy đủ) LẪN
 * `NoriQuickPopover` (popup nổi tại chỗ, thêm 2026-07-27 theo góp ý user: bấm icon nổi không nên
 * bắt buộc chuyển hẳn sang 1 trang riêng khi giọng nói đã chạy được). `init()` tự no-op nếu agent
 * đã tồn tại (`useNoriAgentStore`), nên gọi từ CẢ 2 nơi là an toàn - nơi nào mount trước thực sự
 * tạo agent, những lần gọi sau chỉ là no-op, và vì dùng CHUNG 1 store nên lịch sử hội thoại tiếp
 * nối liền mạch dù bắt đầu từ popup rồi mở rộng sang trang đầy đủ hay ngược lại.
 *
 * `activeVehicleId` ưu tiên xe đang có phiên OBD sống (obdSessionStore) - đúng cho vehicleTools
 * (mục 7). Nhưng businessTools (health/trip/odo/expense/maintenance) không cần BLE để có dữ liệu -
 * nếu CHỈ dùng obdSessionStore, mọi câu hỏi kiểu "tháng này tốn bao nhiêu tiền xăng" sẽ luôn báo
 * "unavailable" khi chưa kết nối OBD dù xe đã có đủ dữ liệu trên server. Fallback theo đúng cách
 * HomeScreen.tsx đang chọn "xe đang xem" (selectedVehicleStore -> xe mặc định -> xe đầu tiên).
 */
export function useInitNoriAgent(): void {
  const init = useNoriAgentStore((s) => s.init);
  const userName = useAuthStore((s) => s.user?.name);
  const { data: vehiclesRaw } = useVehicles();
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  // init() chỉ tạo NoriAgent 1 LẦN DUY NHẤT - closure truyền vào lần đầu sẽ bị "đóng băng" mãi
  // mãi nếu đọc thẳng `vehicles` (lúc đó danh sách xe thường CHƯA tải xong, `vehicles = []`).
  // Dùng ref để callback luôn đọc được danh sách xe MỚI NHẤT tại thời điểm NoriAgent thực sự gọi
  // getVehicleId(), bất kể init() chạy trước hay sau khi tải xong.
  const vehiclesRef = useRef(vehicles);
  vehiclesRef.current = vehicles;

  useEffect(() => {
    init(() => {
      const obdVehicleId = useObdSessionStore.getState().vehicleId;
      if (obdVehicleId) return obdVehicleId;
      const selectedVehicleId = useSelectedVehicleStore.getState().selectedVehicleId;
      if (selectedVehicleId) return selectedVehicleId;
      const defaultVehicle = vehiclesRef.current.find((v) => v.is_default) ?? vehiclesRef.current[0];
      return defaultVehicle?.id ?? null;
    }, userName);
  }, [init, userName]);
}
