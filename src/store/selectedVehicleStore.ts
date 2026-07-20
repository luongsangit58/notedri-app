import { create } from 'zustand';

/**
 * Xe đang được chọn trên Trang chủ - lưu TOÀN CỤC (không phải state riêng của
 * HomeScreen) để các màn khác (Lời nhắc, ODO, Đổ xăng...) mở qua tab bar/FAB
 * (không có route.params.vehicleId) vẫn hiểu đúng "xe đang xem" thay vì luôn
 * rơi về xe mặc định. Tester báo: bấm thẳng icon "Lời nhắc" ở tab bar (không
 * qua nút trên Home) vẫn hiện xe mặc định dù đang chọn xe khác trên Home.
 */
type SelectedVehicleState = {
  selectedVehicleId: number | null;
  setSelectedVehicleId: (id: number | null) => void;
};

export const useSelectedVehicleStore = create<SelectedVehicleState>((set) => ({
  selectedVehicleId: null,
  setSelectedVehicleId: (id) => set({ selectedVehicleId: id }),
}));
