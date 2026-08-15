import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FontAwesome5 } from '@expo/vector-icons';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuthStore } from '../../store/authStore';
import { useVehicles } from '../../hooks/useVehicles';
import { useSelectedVehicleStore } from '../../store/selectedVehicleStore';
import { useNoriSummary } from '../../services/nori/noriSummary';
import { useColors } from '../../utils/theme';
import { NORI_MOOD_COLOR } from '../../services/nori/nori';
import NoriAvatar from './NoriAvatar';
import NoriQuickPopover from './NoriQuickPopover';

// Rà soát 2026-07-27 (góp ý user: "tích hợp vào linh vật Nori", "bỏ logic Nori cũ đi, thay bằng
// Nori Agent vào") - trước đây bấm icon nổi này mở NoriPopover (bong bóng tĩnh, chỉ đọc mood/tuần/
// phiên lái, KHÔNG liên quan gì tới Nori Agent hỏi-đáp thật ở NoriChatScreen).
//
// Rà soát tiếp (cùng ngày, góp ý user): ban đầu đổi thành điều hướng THẲNG sang NoriChatScreen,
// nhưng vì giọng nói (Phase 3) đã chạy được, bắt buộc rời màn hình hiện tại chỉ để hỏi-đáp nhanh
// là thừa - giờ bấm icon mở `NoriQuickPopover` (popup nổi NGAY TẠI CHỖ, tự nghe luôn, đọc to câu
// trả lời) - có nút "Mở rộng" trong popup đó để nhảy sang NoriChatScreen khi cần gõ chữ/xem lịch
// sử/chấm điểm/xác nhận ghi dữ liệu. Vẫn ẩn hẳn icon nổi khi ĐANG Ở TRONG NoriChatScreen (bug thật
// bắt được qua ảnh chụp màn hình user gửi: icon nổi lúc nào cũng theo cùng, che/rối giao diện) -
// và ẩn thêm khi popup đang mở (không hiện icon nổi đè lên popup của chính nó).
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
// Rà soát 14/8 (góp ý user: phần lồi ra màu cam khi đã gạt Nori vào cạnh màn
// hình to/lấn ra quá mức, trông lạc quẻ với viền các box khác) - thu nhỏ lại
// (10px, trước là 16) và bớt cao/bớt bo tròn (xem style "tay cầm" bên dưới)
// cho gọn, gần khớp độ dày viền các thẻ card khác trên Home thay vì nổi cộm.
const DOCK_PEEK = 10; // số px còn lộ ra khi đã gạt vào sát cạnh màn hình
const TAP_MOVE_THRESHOLD = 6; // dx/dy dưới ngưỡng này -> coi là bấm, không phải kéo
const EDGE_MARGIN = 12;
const DEFAULT_BOTTOM_OFFSET = 140; // tránh đè lên pill kết nối OBD2 (ObdSessionBanner, bottom:96)
// Cải thiện UX 2026-07-28 (góp ý user): chỉ hiện 1 LẦN DUY NHẤT cho người dùng mới, chỉ dẫn
// "đây là Nori, bấm vào để hỏi đáp" - AsyncStorage để nhớ đã xem qua lần cài app sau.
const COACHMARK_KEY = 'nori_floating_coachmark_seen';

export default function NoriFloatingButton() {
  const colors = useColors();
  // Rà soát 2026-07-27 (fix crash thật bắt được qua logcat thiết bị): KHÔNG dùng
  // useNavigationState() ở đây - hook đó chỉ đọc được state từ bên TRONG 1
  // Navigator/màn hình thật, còn NoriFloatingButton lại mount làm anh em cùng cấp
  // với <RootNavigator/> (ngoài mọi Navigator, xem App.tsx) - gọi hook này ném lỗi
  // "Couldn't get the navigation state. Is your component inside a navigator?"
  // NGAY LẦN RENDER ĐẦU TIÊN, tức là crash 100% các lần mở app. Dùng navigationRef
  // (đã có sẵn, gắn vào <NavigationContainer ref={navigationRef}> ở App.tsx) - đọc
  // được từ NGOÀI cây component, đúng vị trí NoriFloatingButton đang đứng.
  const [activeRouteName, setActiveRouteName] = useState<string | undefined>(() =>
    navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined,
  );
  useEffect(() => {
    const unsubscribe = navigationRef.addListener('state', () => {
      setActiveRouteName(navigationRef.getCurrentRoute()?.name);
    });
    return unsubscribe;
  }, []);
  const [showPopup, setShowPopup] = useState(false);
  const token = useAuthStore((s) => s.token);
  const { data: vehiclesRaw } = useVehicles({ enabled: !!token });
  const vehicles: any[] = Array.isArray(vehiclesRaw?.data) ? vehiclesRaw.data
    : Array.isArray(vehiclesRaw) ? vehiclesRaw : [];

  const selectedVehicleId = useSelectedVehicleStore((s) => s.selectedVehicleId) ?? undefined;
  const defaultVehicle = vehicles.find((v) => v.is_default) ?? vehicles[0];
  const vehicleId = selectedVehicleId ?? defaultVehicle?.id;

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
  // panResponder (bên dưới) được tạo 1 LẦN DUY NHẤT qua useRef().current - đọc `mood` trực tiếp
  // trong closure của nó sẽ mãi mãi thấy giá trị của LẦN RENDER ĐẦU TIÊN (cùng lớp bug stale
  // closure mà `dockedRef`/`posValue` đã né ở trên) - dùng ref để closure luôn đọc được giá trị
  // MỚI NHẤT.
  const moodRef = useRef(mood);
  moodRef.current = mood;

  // Huy hiệu nhấp nháy khi Nori có điều đáng chú ý CHƯA XEM (cải thiện UX 2026-07-28, góp ý
  // user) - `seenMoodRef` chỉ sống trong bộ nhớ (KHÔNG lưu AsyncStorage, mất khi tắt app - chấp
  // nhận được vì "đã xem" chỉ có ý nghĩa trong 1 phiên dùng app, không cần nhớ qua nhiều ngày).
  // Đánh dấu "đã xem" NGAY khi mở popup - không cần đợi thêm render nào vì set trước
  // setShowPopup(true) trong CÙNG 1 lần bấm, React gộp cả 2 vào 1 lần render.
  const seenMoodRef = useRef<string | null>(null);
  const showAlertBadge = (mood === 'urgent' || mood === 'warn') && seenMoodRef.current !== mood;
  const badgePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!showAlertBadge) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(badgePulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [showAlertBadge, badgePulse]);

  // Coachmark 1 lần cho người dùng MỚI (cải thiện UX 2026-07-28, góp ý user) - chỉ dẫn "đây là
  // Nori, bấm vào để hỏi đáp" vì icon nổi không có gì tự giải thích công dụng cho người chưa
  // từng thấy. Tự ẩn sau 6s nếu không ai bấm, và ẩn NGAY khi user tương tác với icon (chạm/kéo -
  // xem panResponder bên dưới) vì lúc đó coi như đã "phát hiện" ra icon rồi.
  const [showCoachmark, setShowCoachmark] = useState(false);
  const coachmarkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissCoachmark = useCallback(() => {
    if (coachmarkTimerRef.current) {
      clearTimeout(coachmarkTimerRef.current);
      coachmarkTimerRef.current = null;
    }
    setShowCoachmark(false);
    AsyncStorage.setItem(COACHMARK_KEY, '1').catch(() => {});
  }, []);
  useEffect(() => {
    if (!token || !vehicleId) return;
    let cancelled = false;
    AsyncStorage.getItem(COACHMARK_KEY)
      .then((seen) => {
        if (cancelled || seen) return;
        setShowCoachmark(true);
        coachmarkTimerRef.current = setTimeout(dismissCoachmark, 6000);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, vehicleId, dismissCoachmark]);
  useEffect(() => () => {
    if (coachmarkTimerRef.current) clearTimeout(coachmarkTimerRef.current);
  }, []);

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
        // Bất kỳ chạm nào (bấm hay kéo) đều coi như user đã "phát hiện" ra icon - ẩn coachmark
        // và đánh dấu mood hiện tại là "đã xem" (tắt huy hiệu nhấp nháy) ngay từ đây, không đợi
        // đến khi popup thực sự mở (đỡ phải lặp lại cùng logic ở cả nhánh tap lẫn nhánh kéo).
        dismissCoachmark();
        seenMoodRef.current = moodRef.current;
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
          // Bấm: nếu đang gạt vào cạnh -> hiện ra trước, CHƯA mở popup ngay (đỡ
          // bấm nhầm khi chỉ định kéo icon ra để dùng lại). Nếu đã hiện đầy đủ
          // -> mở NoriQuickPopover (popup nổi tại chỗ, xem chú thích đầu file).
          const side = posValue.current.x < width / 2 ? 'left' : 'right';
          if (dockedRef.current) undockTo(side, posValue.current.y);
          else setShowPopup(true);
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

  // Rà soát 14/8 (góp ý user: sau khi thu nhỏ "tay cầm" lồi ra cho gọn mắt, lại
  // khó chạm/kéo ra lại vì vùng bắt chạm trước giờ vẫn đi đúng theo kích thước
  // hình vẽ - chỉ đúng DOCK_PEEK px thật sự nằm trên màn hình). Tách riêng vùng
  // NHÌN (nhỏ gọn, giữ nguyên) khỏi vùng CHẠM (rộng hơn hẳn, vô hình) bằng
  // hitSlop - mở rộng đúng về phía CÒN NẰM TRONG MÀN HÌNH (trái nếu đang gạt
  // sát cạnh phải, phải nếu đang gạt sát cạnh trái) - mở rộng ra phía ngoài màn
  // hình vô nghĩa vì không có điểm chạm nào ở đó để bắt.
  const dockHitSlop = dockUi.docked
    ? (dockUi.side === 'left'
        ? { top: 16, bottom: 16, left: 4, right: 28 }
        : { top: 16, bottom: 16, left: 28, right: 4 })
    : { top: 8, bottom: 8, left: 8, right: 8 };

  return (
    <>
      {/* Ẩn icon khi ĐANG Ở TRONG NoriChatScreen (bấm icon lúc đó thừa, dễ rối - bug thật bắt
          được qua ảnh chụp màn hình user gửi) HOẶC khi popup đang mở (không hiện icon đè lên
          popup của chính nó, cùng lý do NoriPopover cũ từng ẩn lúc mở). */}
      {activeRouteName !== 'NoriChat' && !showPopup && (
        <Animated.View
          {...panResponder.panHandlers}
          hitSlop={dockHitSlop}
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
                  width: DOCK_PEEK + 6,
                  height: SIZE * 0.65,
                  borderRadius: 10,
                  backgroundColor: NORI_MOOD_COLOR[mood],
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.25,
                  shadowRadius: 4,
                  elevation: 6,
                }}>
                <View style={{ width: 2.5, height: 16, borderRadius: 2, backgroundColor: '#fff8' }} />
              </View>
            </View>
          ) : (
            // Hiện đầy đủ - quầng sáng mờ dần (radial gradient, không viền) khớp
            // đúng hiệu ứng web. Rà soát 15/8 (user rút lại góp ý viền cam/nền khối/
            // nút X thêm ở rà soát 14/8 - đã có thao tác vuốt vào cạnh để thu gọn
            // rồi, không cần thêm nút X; nền khối phía sau cũng không cần luôn).
            // Viền chỉ thật sự cần cho ĐÚNG lúc coachmark chào lần đầu (showCoachmark)
            // - xem viền cam bên dưới, chỉ hiện trong khoảng thời gian đó rồi mất.
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
              <View style={{
                margin: BACKDROP_PAD, borderRadius: SIZE / 2,
                borderWidth: 2, borderColor: showCoachmark ? '#F59E0B' : 'transparent',
              }}>
                <NoriAvatar mood={mood} size={SIZE} />
              </View>
              {/* Huy hiệu nhấp nháy khi có điều đáng chú ý CHƯA XEM (cải thiện UX 2026-07-28) -
                  chỉ hiện ở dạng đầy đủ (không hiện ở "tay cầm" lúc đã gạt vào cạnh, đủ nhỏ để
                  không đáng thêm 1 lớp phức tạp cho trạng thái đã thu gọn). */}
              {showAlertBadge && (
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: NORI_MOOD_COLOR[mood],
                    borderWidth: 2,
                    borderColor: colors.background,
                    transform: [{ scale: badgePulse }],
                  }}
                />
              )}
            </>
          )}
        </Animated.View>
      )}

      {/* Coachmark 1 lần cho người dùng mới (cải thiện UX 2026-07-28) - chỉ hiện ở dạng đầy đủ,
          cùng điều kiện hiển thị với icon chính, cộng chưa từng bị gạt vào cạnh (trạng thái
          "tay cầm" chỉ xảy ra SAU khi user đã tương tác - lúc đó coachmark đã tự ẩn từ lâu). */}
      {showCoachmark && !dockUi.docked && activeRouteName !== 'NoriChat' && !showPopup && (
        <Animated.View style={{ position: 'absolute', transform: pos.getTranslateTransform() }}>
          <View
            style={{
              position: 'absolute',
              left: boxSize + 8,
              top: boxSize / 2 - 22,
              width: 190,
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 12,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>
              Bấm vào đây để hỏi Nori bất cứ lúc nào!
            </Text>
            <TouchableOpacity
              onPress={dismissCoachmark}
              hitSlop={10}
              style={{
                position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11,
                backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center',
                shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 4,
              }}
            >
              <FontAwesome5 name="times" size={10} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      <NoriQuickPopover visible={showPopup} onClose={() => setShowPopup(false)} vehicleId={vehicleId} />
    </>
  );
}
