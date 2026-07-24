import React, { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { useVehicles } from '../../hooks/useVehicles';
import { useSelectedVehicleStore } from '../../store/selectedVehicleStore';
import { useNoriSummary } from '../../services/nori/noriSummary';
import { useColors } from '../../utils/theme';
import { NORI_MOOD_COLOR } from '../../services/nori/nori';
import NoriAvatar from './NoriAvatar';
import NoriPopover from './NoriPopover';

// Icon Nori nổi toàn cục (rà soát 22/7, góp ý user: bên web Nori là icon nổi cố
// định ở góc màn hình, bấm ra bong bóng - bên app trước đó KHÔNG có, Nori chỉ
// nằm tĩnh trong Home/HealthScreen). Mount 1 lần ở App.tsx (cùng cấp
// ObdSessionBanner), sống qua mọi lần chuyển màn hình.
//
// Rà soát 24/7 (góp ý user): kéo/gạt Nori vào sát cạnh màn hình để THU NHỎ lại
// (chỉ lộ 1 phần), bấm vào phần lộ ra để HIỆN LẠI đầy đủ - kiểu bong bóng chat
// nổi quen thuộc. Bản trước đó (bị 1 đồng nghiệp revert kèm sửa lỗi hooks ở
// commit khác) dùng cờ AsyncStorage "ẩn vĩnh viễn" - ẩn xong KHÔNG có đường
// quay lại từ UI, đúng cái user không muốn. Bỏ hẳn cờ đó, thay bằng cơ chế
// kéo-thả này (không cần AsyncStorage, không cần thêm dependency mới -
// PanResponder + Animated đều có sẵn trong react-native core).
const SIZE = 52;
const BACKDROP_PAD = 6;
const DOCK_PEEK = 16; // số px còn lộ ra khi đã gạt vào sát cạnh màn hình
const TAP_MOVE_THRESHOLD = 6; // dx/dy dưới ngưỡng này -> coi là bấm, không phải kéo
const EDGE_MARGIN = 12;
const DEFAULT_BOTTOM_OFFSET = 140; // tránh đè lên pill kết nối OBD2 (ObdSessionBanner, bottom:96)

export default function NoriFloatingButton() {
  const colors = useColors();
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
  // Rà soát 24/7: "docked" ĐỌC bên trong closure của PanResponder (tạo 1 LẦN
  // DUY NHẤT qua useRef().current, xem panResponder bên dưới) - nếu để dạng
  // useState, closure đó mãi mãi thấy giá trị docked của LẦN RENDER ĐẦU TIÊN
  // (luôn false), setDocked(true) sau đó vô nghĩa với closure cũ. Dùng useRef
  // thuần (không cần re-render khi đổi - không có UI nào vẽ theo docked cả,
  // vị trí hiển thị đã do `pos` Animated đảm nhiệm).
  const dockedRef = useRef(false);
  // Chỉ tính mood khi CÓ vehicleId để tránh gọi API thừa lúc chưa đăng nhập/chưa có xe.
  const { mood } = useNoriSummary(token && vehicleId ? vehicleId : undefined);

  const boxSize = SIZE + BACKDROP_PAD * 2;
  const initialScreen = Dimensions.get('window');
  const pos = useRef(new Animated.ValueXY({
    x: EDGE_MARGIN,
    y: initialScreen.height - DEFAULT_BOTTOM_OFFSET - boxSize,
  })).current;
  const posValue = useRef({ x: EDGE_MARGIN, y: initialScreen.height - DEFAULT_BOTTOM_OFFSET - boxSize });

  // Rà soát 24/7: dockTo/undockTo/onPanResponderRelease đều gọi Dimensions.get('window')
  // TẠI THỜI ĐIỂM DÙNG thay vì đọc 1 biến `screen` ngoài closure - panResponder tạo 1 LẦN
  // DUY NHẤT (useRef().current) nên bất kỳ biến nào nó đóng lại từ lần render đầu sẽ đứng
  // yên mãi mãi, kể cả sau khi xoay màn hình (app hỗ trợ cả ngang/dọc - orientation:"default"
  // trong app.json, đặc biệt cho màn hình xe nằm ngang) đổi kích thước thật.
  const dockTo = (side: 'left' | 'right', y: number) => {
    const { width } = Dimensions.get('window');
    const x = side === 'left' ? -(boxSize - DOCK_PEEK) : width - DOCK_PEEK;
    posValue.current = { x, y };
    Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 8 }).start();
    dockedRef.current = true;
  };

  const undockTo = (side: 'left' | 'right', y: number) => {
    const { width } = Dimensions.get('window');
    const x = side === 'left' ? EDGE_MARGIN : width - boxSize - EDGE_MARGIN;
    posValue.current = { x, y };
    Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 8 }).start();
    dockedRef.current = false;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pos.setOffset(posValue.current);
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_e, gesture) => {
        pos.flattenOffset();
        const { width, height } = Dimensions.get('window');
        const isTap = Math.abs(gesture.dx) < TAP_MOVE_THRESHOLD && Math.abs(gesture.dy) < TAP_MOVE_THRESHOLD;
        const rawX = posValue.current.x + gesture.dx;
        const rawY = posValue.current.y + gesture.dy;
        const clampedY = Math.max(60, Math.min(height - boxSize - 60, rawY));

        if (isTap) {
          // Bấm: nếu đang gạt vào cạnh -> hiện ra trước, CHƯA mở bong bóng ngay
          // (đỡ bấm nhầm khi chỉ định kéo icon ra để dùng lại). Nếu đã hiện đầy
          // đủ -> mở bong bóng như bình thường.
          const side = posValue.current.x < width / 2 ? 'left' : 'right';
          if (dockedRef.current) undockTo(side, posValue.current.y);
          else setOpen(true);
          return;
        }

        // Thả tay sau khi kéo: luôn gạt về cạnh gần nhất để thu nhỏ lại, chỉ lộ
        // 1 phần nhỏ (DOCK_PEEK) - giữ nguyên độ cao vừa thả.
        const side = rawX + boxSize / 2 < width / 2 ? 'left' : 'right';
        dockTo(side, clampedY);
      },
    }),
  ).current;

  if (!token || !vehicleId) return null;

  return (
    <>
      {/* Ẩn nút khi bong bóng đang mở - giống web chỉ ẩn icon ở đúng trang
          /nori, không hiện icon nổi đè lên bong bóng của chính nó. */}
      {!open && (
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            position: 'absolute',
            transform: pos.getTranslateTransform(),
            padding: BACKDROP_PAD,
            borderRadius: boxSize / 2,
            backgroundColor: colors.card,
            borderWidth: 2,
            borderColor: NORI_MOOD_COLOR[mood],
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 8,
          }}>
          <NoriAvatar mood={mood} size={SIZE} />
        </Animated.View>
      )}
      <NoriPopover visible={open} onClose={() => setOpen(false)} vehicleId={vehicleId} vehicleName={vehicleName} />
    </>
  );
}
