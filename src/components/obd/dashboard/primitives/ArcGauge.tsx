import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Path, Polygon, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useCountingNumber } from '../../../../hooks/useCountingNumber';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Cung bán nguyệt trong khung 100x100 - kỹ thuật pathLength="100" (mượn từ
// bản thiết kế artifact): stroke-dashoffset tính thẳng theo % (0-100), không
// cần tự tính chu vi cung. 0% = kim/cung chỉ trái (-90deg), 100% = chỉ phải
// (+90deg), quét qua đỉnh (0deg) ở giữa thang.
const ARC_D = 'M 10 50 A 40 40 0 0 1 90 50';

const MINOR_PER_GAP = 3;

// Rà soát 24/7 (góp ý user: vạch chia ra số xấu kiểu "44/88/132/176" thay vì
// số tròn như đồng hồ thật) - bản trước chỉ chia đều THEO SỐ LƯỢNG vạch (6
// vạch, kể cả 2 đầu min/max), không quan tâm bước chia có "tròn" hay không.
// Đổi sang thuật toán chọn bước "đẹp" (1-2-5 × 10ⁿ, cùng cách các phần mềm
// biểu đồ/đồng hồ thật hay dùng) - hướng tới ~5 vạch chính, bước có thể không
// vừa khít tới max (kim vẫn đi tới max, chỉ vạch cuối có thể dừng trước đó
// 1 chút) - ĐÚNG kiểu đồng hồ tốc độ thật (vd tốc kế 220 thường có vạch tại
// 0-50-100-150-200, không cần vạch đúng tại 220).
function niceTickStep(range: number): number {
  if (range <= 0) return 1;
  const raw = range / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return nice * mag;
}

function buildTicks(min: number, max: number): { deg: number; major: boolean; value?: number }[] {
  const step = niceTickStep(max - min);
  const majors: number[] = [];
  for (let v = min; v <= max + step * 0.001; v += step) majors.push(Math.round(v));
  const valueToDeg = (v: number) => -90 + ((v - min) / (max - min)) * 180;

  const ticks: { deg: number; major: boolean; value?: number }[] = [];
  for (let i = 0; i < majors.length; i++) {
    ticks.push({ deg: valueToDeg(majors[i]), major: true, value: majors[i] });
    if (i < majors.length - 1) {
      const a0 = valueToDeg(majors[i]);
      const a1 = valueToDeg(majors[i + 1]);
      for (let j = 1; j <= MINOR_PER_GAP; j++) {
        ticks.push({ deg: a0 + (j / (MINOR_PER_GAP + 1)) * (a1 - a0), major: false });
      }
    }
  }
  return ticks;
}

export interface ArcGaugeProps {
  value: number | null;
  min: number;
  max: number;
  size: number;
  label?: string;
  unit?: string;
  trackColor: string;
  fillColor: string;
  needleColor?: string;
  tickColor?: string;
  valueColor?: string;
  labelColor?: string;
  valueFontFamily?: string;
  strokeWidth?: number;
  // Bước làm tròn của số liệu (vd RPM=50) - truyền vào để số ĐẾM chỉ đi qua
  // các mốc tròn bước khi đang chạy animation, xem useCountingNumber.
  quantizeStep?: number;
  glow?: boolean;
  showNeedle?: boolean;
  // Bật/tắt CẢ vạch chia LẪN số trị tại vạch chính (trước đây tách riêng
  // showTicks/showMinMax - gộp làm 1 vì luôn đi cùng nhau trên đồng hồ thật).
  showTicks?: boolean;
  showReadout?: boolean;
  // Rà soát 24/7 (góp ý user: kim chỉ lên xuống đơn điệu, muốn có gì đó "sinh
  // động" hơn khi vượt 1 ngưỡng nhất định, vd tốc độ qua 80/100, vòng tua qua
  // 3000/4000) - danh sách mốc ĐỘNG, không gắn với redline/an toàn thật của xe
  // (khác hẳn "shift-light" đã bỏ ở Racing vì không có dữ liệu redline thật) -
  // thuần tuý hiệu ứng thị giác cho cảm giác "tăng tốc". Mốc cao nhất mà giá
  // trị hiện tại đã vượt qua quyết định màu cung/kim/số + kích hoạt glow nhấp
  // nháy nhẹ (không đổi màu thì vẫn cho pulse để báo "đang ở mốc cao").
  // `pulse: false` cho những mốc chỉ đổi màu KHÔNG nhấp nháy (vd dải màu tốc
  // độ phủ toàn thang - chỉ mốc cao nhất mới cần "sinh động", còn lại đứng
  // yên) - không set = mặc định pulse (giữ nguyên hành vi cũ cho warn/crit).
  zones?: { min: number; color: string; pulse?: boolean }[];
  // Rà soát 24/7 (góp ý user: cung tốc độ chỉ 1 màu cam trông đơn điệu, muốn
  // dải màu chuyển dần theo tốc độ như đồng hồ đua thật, vd 0-20 xanh dương,
  // 20-40 xanh lục...80+ đỏ) - danh sách mốc (value, color) dựng thành
  // gradient tô cho cung, phần cung đã "quét" tới đâu lộ màu tới đó (đứng
  // riêng với `zones` vì đây là gradient MƯỢT cho nét vẽ, còn zones là màu
  // PHẲNG cho kim/số/glow).
  colorStops?: { value: number; color: string }[];
  // false cho ảnh xem trước tĩnh trong DashboardStylePicker - không cần
  // animate lại mỗi lần list re-render.
  animate?: boolean;
}

export default function ArcGauge({
  value, min, max, size, label, unit,
  trackColor, fillColor, needleColor, tickColor, valueColor, labelColor, valueFontFamily,
  strokeWidth, quantizeStep = 1, glow = true, showNeedle = true, showTicks = true, showReadout = true,
  zones, colorStops, animate = true,
}: ArcGaugeProps) {
  const gradId = useRef(`arcGrad_${Math.random().toString(36).slice(2, 9)}`).current;
  // Rà soát 24/7 (góp ý user: cung quá dày trông thô, đồng hồ xe thật có nét
  // mảnh + nhiều chi tiết vạch/số hơn là 1 khối màu to) - giảm hẳn độ dày mặc
  // định, chi tiết chuyển sang vạch chia + số (xem ALL_TICKS ở trên).
  // Rà soát 27/7 (góp ý user, so ảnh đồng hồ thật: dải màu "bo tròn cục mịch" -
  // strokeLinecap="round" trước đây bo tròn CẢ 2 đầu cung thành khối tròn to ở
  // đầu 0, cộng lớp track mờ phía dưới chồng lên tạo cảm giác 1 khối màu dày.
  // Đổi sang "butt" (đầu vuông/thẳng, không bo) + giảm thêm độ dày -> nét mảnh
  // hơn, thanh thoát hơn, gần đúng cảm giác đồng hồ cơ thật (ảnh tham khảo).
  const resolvedStrokeWidth = strokeWidth ?? Math.max(2, Math.min(5, size * 0.018));
  const clamped = Math.max(min, Math.min(max, value ?? min));
  const frac = max > min ? (clamped - min) / (max - min) : 0;
  const ticks = showTicks ? buildTicks(min, max) : [];

  // Mốc cao nhất đã vượt (xem comment `zones` ở ArcGaugeProps) - sort phòng
  // trường hợp truyền không theo thứ tự tăng dần.
  const activeZone = zones && zones.length
    ? [...zones].sort((a, b) => b.min - a.min).find((z) => (value ?? min) >= z.min)
    : undefined;
  const effectiveFillColor = activeZone?.color ?? fillColor;
  const effectiveNeedleColor = activeZone?.color ?? (needleColor ?? fillColor);
  const effectiveValueColor = activeZone?.color ?? (valueColor ?? fillColor);
  // Mặc định pulse=true (giữ đúng hành vi cũ của warn/crit) - chỉ mốc khai báo
  // rõ `pulse: false` mới đứng yên (dải màu tốc độ phủ toàn thang, không phải
  // mốc nào cũng cần "sinh động").
  const shouldPulse = !!activeZone && activeZone.pulse !== false;

  // Gradient tô cung theo `colorStops` (nếu có) - offset % tính thẳng theo vị
  // trí value trong khoảng [min,max], clamp về [0,100] phòng truyền lệch thang.
  const gradientStops = colorStops?.length
    ? [...colorStops].sort((a, b) => a.value - b.value).map((cs) => ({
      offset: `${Math.max(0, Math.min(100, ((cs.value - min) / (max - min)) * 100))}%`,
      color: cs.color,
    }))
    : null;
  const arcStroke = gradientStops ? `url(#${gradId})` : effectiveFillColor;

  // Glow nhấp nháy nhẹ khi đang ở 1 mốc "sinh động" - dừng hẳn animation khi
  // rời mốc (đỡ hao pin/CPU khi không cần), khởi động lại khi vào mốc MỚI
  // (key theo màu, không theo object - object đổi identity mỗi lần render).
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!shouldPulse) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPulse, activeZone?.color]);
  const pulseRadius = pulse.interpolate({ inputRange: [0, 1], outputRange: [10, 24] });

  const progress = useRef(new Animated.Value(frac)).current;
  useEffect(() => {
    if (!animate) { progress.setValue(frac); return; }
    Animated.timing(progress, {
      toValue: frac, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frac, animate]);

  const dashOffset = progress.interpolate({ inputRange: [0, 1], outputRange: [100, 0] });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '90deg'] });

  const needleLength = size / 2 - size * 0.14;
  // Số liệu ĐẾM mượt theo cùng nhịp với kim/cung (góp ý user: bản đầu chỉ có
  // kim/cung chạy mượt, con số nhảy khựng ngay lập tức) - xem useCountingNumber.
  const display = useCountingNumber(value, 0, animate, quantizeStep);
  // Rà soát 24/7 (góp ý user: chữ/số quá nhỏ, khó đọc trên màn đầu xe) - trần
  // cũ (32/12/12/11) được tính cho gaugeSize tối đa 190dp, giữ nguyên trần đó
  // sẽ vô hiệu hoá việc gaugeSize giờ có thể lên tới 340dp (xem useCockpitLayout).
  const valueFontSize = Math.max(14, Math.min(56, size * 0.17));
  const unitFontSize = Math.max(9, Math.min(18, size * 0.065));
  const labelFontSize = Math.max(9, Math.min(18, size * 0.065));
  const tickLabelSize = Math.max(8, Math.min(15, size * 0.05));

  // Kim thon (đầu nhọn + đuôi đối trọng ngắn) thay vì thanh chữ nhật cũ -
  // vẽ 1 lần bằng Polygon trong hệ toạ độ LOCAL của khung xoay (pivot ở giữa).
  const needleW = needleLength * 2;
  const cx = needleLength;
  const tipY = 0;
  const pivotY = needleLength;
  const tailY = pivotY + needleLength * 0.16;
  const tipHalf = Math.max(0.6, size * 0.003);
  const baseHalf = Math.max(1.4, size * 0.013);
  const tailHalf = baseHalf * 1.2;
  const needlePoints = [
    `${cx - tipHalf},${tipY}`,
    `${cx + tipHalf},${tipY}`,
    `${cx + baseHalf},${pivotY}`,
    `${cx + tailHalf},${tailY}`,
    `${cx - tailHalf},${tailY}`,
    `${cx - baseHalf},${pivotY}`,
  ].join(' ');

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFillObject}>
        {gradientStops && (
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              {gradientStops.map((s, i) => <Stop key={i} offset={s.offset} stopColor={s.color} />)}
            </LinearGradient>
          </Defs>
        )}
        {/* Rà soát (góp ý user: cung tốc độ 1 màu cam đơn điệu) - khi có
            colorStops, track nền cũng tô sẵn dải màu (mờ) để luôn thấy trước
            "quang phổ" đủ thang, phần đã quét (AnimatedPath bên dưới) tô ĐẬM
            đúng dải màu đó, sáng rõ hơn hẳn phần chưa tới. */}
        <Path
          d={ARC_D}
          stroke={gradientStops ? `url(#${gradId})` : trackColor}
          strokeWidth={resolvedStrokeWidth}
          strokeLinecap="butt"
          fill="none"
          opacity={gradientStops ? 0.28 : 1}
        />
        <AnimatedPath
          d={ARC_D}
          stroke={arcStroke}
          strokeWidth={resolvedStrokeWidth}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray="100"
          strokeDashoffset={dashOffset as unknown as number}
        />
      </Svg>

      {ticks.map(({ deg, major }, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}
        >
          <View style={{
            width: major ? Math.max(1.5, size * 0.012) : Math.max(1, size * 0.007),
            height: major ? size * 0.06 : size * 0.03,
            marginTop: size * 0.045,
            backgroundColor: tickColor ?? trackColor,
            borderRadius: 1,
            opacity: major ? 0.9 : 0.45,
          }}
          />
        </View>
      ))}

      {/* Số trị tại vạch chính - bước chia "đẹp" (xem niceTickStep/buildTicks
          ở trên), đúng kiểu đồng hồ đo ô tô thật thay vì chỉ ghi min/max ở 2
          góc dưới. Chữ số tự XOAY NGƯỢC lại (transform lồng nhau) để luôn
          đứng thẳng dù vị trí đặt theo góc vạch. */}
      {ticks.filter((t) => t.major).map(({ deg, value: tickValue }, i) => (
        <View
          key={`lbl-${i}`}
          pointerEvents="none"
          style={{ position: 'absolute', width: size, height: size, alignItems: 'center', transform: [{ rotate: `${deg}deg` }] }}
        >
          <View style={{ marginTop: size * 0.14, transform: [{ rotate: `${-deg}deg` }] }}>
            <Text allowFontScaling={false} style={{ color: tickColor ?? labelColor, fontSize: tickLabelSize, fontWeight: '700' }}>
              {tickValue}
            </Text>
          </View>
        </View>
      ))}

      {showNeedle && (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', width: needleLength * 2, height: needleLength * 2, left: size / 2 - needleLength, top: size / 2 - needleLength }}
        >
          <Animated.View style={{ width: needleLength * 2, height: needleLength * 2, transform: [{ rotate }] }}>
            <Svg width={needleW} height={needleW} style={StyleSheet.absoluteFillObject}>
              <Polygon points={needlePoints} fill={effectiveNeedleColor} />
            </Svg>
          </Animated.View>
        </View>
      )}
      {showNeedle && (
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <Circle cx={50} cy={50} r={4.2} stroke={effectiveNeedleColor} strokeWidth={1.4} fill="none" opacity={0.9} />
          <Circle cx={50} cy={50} r={1.6} fill={effectiveNeedleColor} />
        </Svg>
      )}

      {showReadout && (
        <View pointerEvents="none" style={{ position: 'absolute', top: size * 0.58, maxWidth: size * 0.62, alignItems: 'center' }}>
          <Animated.Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: valueFontSize,
              fontWeight: '800',
              color: effectiveValueColor,
              fontFamily: valueFontFamily,
              textShadowColor: activeZone ? activeZone.color : glow ? fillColor : 'transparent',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: shouldPulse ? pulseRadius : (activeZone || glow) ? 10 : 0,
            }}
          >
            {display ?? '-'}
          </Animated.Text>
          {unit ? <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: unitFontSize, color: labelColor, marginTop: -2 }}>{unit}</Text> : null}
          {label ? <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: labelFontSize, color: labelColor, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text> : null}
        </View>
      )}
    </View>
  );
}
