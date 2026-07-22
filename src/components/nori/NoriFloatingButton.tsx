import React, { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useVehicles } from '../../hooks/useVehicles';
import { useSelectedVehicleStore } from '../../store/selectedVehicleStore';
import { useNoriSummary } from '../../services/nori/noriSummary';
import NoriAvatar from './NoriAvatar';
import NoriPopover from './NoriPopover';

// Icon Nori nổi toàn cục (rà soát 22/7, góp ý user: bên web Nori là icon nổi cố
// định ở góc màn hình, bấm ra bong bóng - bên app trước đó KHÔNG có, Nori chỉ
// nằm tĩnh trong Home/HealthScreen). Mount 1 lần ở App.tsx (cùng cấp
// ObdSessionBanner), sống qua mọi lần chuyển màn hình.
//
// Đặt góc DƯỚI-TRÁI (không phải dưới-phải như web): QuickAddFAB đã chiếm
// bottom:24/right:20 ở AddReminderScreen, và cùng offset dưới-phải sẽ đụng
// nhau nếu icon Nori hiện toàn cục. Dùng chung độ cao 96 với pill kết nối OBD2
// (ObdSessionBanner, alignSelf:'center') - khác cột (trái) nên không chồng nhau.
export default function NoriFloatingButton() {
  const token = useAuthStore((s) => s.token);
  const { data: vehiclesRaw } = useVehicles({ enabled: !!token });
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  const selectedVehicleId = useSelectedVehicleStore((s) => s.selectedVehicleId) ?? undefined;
  const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];
  const vehicleId = selectedVehicleId ?? defaultVehicle?.id;
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleName = vehicle?.ten ?? vehicle?.name ?? vehicle?.ten_xe ?? '';

  const [open, setOpen] = useState(false);
  // Chỉ tính mood khi CÓ vehicleId để tránh gọi API thừa lúc chưa đăng nhập/chưa có xe.
  const { mood } = useNoriSummary(token && vehicleId ? vehicleId : undefined);

  if (!token || !vehicleId) return null;
  // Ẩn nút khi bong bóng đang mở - giống web chỉ ẩn icon ở đúng trang /nori,
  // không hiện icon nổi đè lên bong bóng của chính nó.
  if (open) return <NoriPopover visible={open} onClose={() => setOpen(false)} vehicleId={vehicleId} vehicleName={vehicleName} />;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setOpen(true)}
      style={{
        position: 'absolute',
        bottom: 96,
        left: 20,
        shadowColor: '#38BDF8',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 0 },
        elevation: 8,
      }}>
      <NoriAvatar mood={mood} size={52} />
    </TouchableOpacity>
  );
}
