import React, { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
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
  // DUY NHẤT qua useRef().current, xem panResponder bên dưới) - nếu chỉ dùng
  // useState, closure đó mãi mãi thấy giá trị docked của LẦN RENDER ĐẦU TIÊN.
  // Giữ dockedRef cho LOGIC (đọc trong closure PanResponder), thêm dockUi
  // (useState) chỉ để KÍCH HOẠT RE-RENDER đổi giao diện - 2 biến luôn set
  // cùng lúc trong dockTo/undockTo.
  //
  // Rà soát tiếp (góp ý user 24/7): quầng sáng mờ dần (giống web) mờ hẳn ra
  // TỚI RÌA theo đúng thiết kế - lúc đã gạt vào cạnh chỉ lộ ra ĐÚNG phần rìa
  // gần như trong suốt đó, gần như vô hình, khó tìm lại để kéo ra. Khi
  // dockUi.docked=true, đổi hẳn sang 1 "tay cầm" đặc màu mood, rõ ràng, dễ
  // thấy để bấm/kéo lại - lúc hiện đầy đủ (không docked) mới dùng quầng sáng
  // mờ giống web.
  const dockedRef = useRef(false);
  const [dockUi, setDockUi] = useState<{ docked: boolean; side: 'left' | 'right' }>({ docked: false, side: 'right' });
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
    setDockUi({ docked: true, side });
  };

  const undockTo = (side: 'left' | 'right', y: number) => {
    const { width } = Dimensions.get('window');
    const x = side === 'left' ? EDGE_MARGIN : width - boxSize - EDGE_MARGIN;
    posValue.current = { x, y };
    Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, friction: 8 }).start();
    dockedRef.current = false;
    setDockUi({ docked: false, side });
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
            width: boxSize,
            height: boxSize,
          }}>
          {dockUi.docked ? (
            // Đã gạt vào cạnh, chỉ lộ DOCK_PEEK - "tay cầm" đặc màu mood, rõ
            // ràng để dễ tìm/bấm lại (quầng sáng mờ dần bên dưới không đủ rõ
            // ở phần rìa gần như trong suốt này).
            <View style={{ flex: 1, alignItems: dockUi.side === 'left' ? 'flex-end' : 'flex-start' }}>
              <View
                style={{
                  width: DOCK_PEEK + 10,
                  height: SIZE * 0.85,
                  borderRadius: 14,
                  backgroundColor: NORI_MOOD_COLOR[mood],
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  elevation: 6,
                }}>
                <View style={{ width: 3, height: 22, borderRadius: 2, backgroundColor: '#fff8' }} />
              </View>
            </View>
          ) : (
            // Hiện đầy đủ - quầng sáng mờ dần (radial gradient, không viền)
            // khớp đúng hiệu ứng web (rà soát 24/7, góp ý user: app trước đó
            // bọc icon trong 1 vòng tròn viền cứng + chấm màu, không giống web).
            <>
              <Svg width={boxSize} height={boxSize} style={StyleSheet.absoluteFillObject}>
                <Defs>
                  <RadialGradient id="noriGlow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0%" stopColor={colors.background} stopOpacity={0.9} />
                    <Stop offset="100%" stopColor={colors.background} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={boxSize / 2} cy={boxSize / 2} r={boxSize / 2} fill="url(#noriGlow)" />
              </Svg>
              <View style={{ margin: BACKDROP_PAD }}>
                <NoriAvatar mood={mood} size={SIZE} />
              </View>
            </>
          )}
        </Animated.View>
      )}
      <NoriPopover visible={open} onClose={() => setOpen(false)} vehicleId={vehicleId} vehicleName={vehicleName} />
    </>
  );
}
