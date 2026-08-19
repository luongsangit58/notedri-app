import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline, Rect } from 'react-native-svg';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';

// Biểu đồ đường/cột dùng chung, tự vẽ bằng react-native-svg (không thêm thư viện
// chart mới - giữ đúng quyết định 15/7 đã áp dụng cho VoltageChart/
// ObdTrendChart: charts tự vẽ để còn lên bản qua OTA, không phải build lại
// native). Cùng mark spec với VoltageChart (OBDTechnicalScreen): line 2px,
// area fill mờ ~12%, hairline gridline trên/dưới, điểm neo tại giá trị mới
// nhất kèm viền màu nền (surface ring), touch-to-scrub.
//
// Rà soát 19/8 (user báo: chạm vào không hiện số liệu tháng, thiếu nút đổi
// cột/đường như web): 2 lỗi trong bản trước:
// 1) onResponderRelease xoá touchIndex NGAY khi nhả tay -> chạm nhanh (tap)
//    coi như không thấy gì (giá trị chỉ hiện đúng lúc còn giữ tay). Giờ giữ
//    nguyên điểm đã chạm tới khi chạm điểm khác, khớp cách ObdTrendChart.tsx
//    (Pressable, chọn dính tới khi chọn lại) đang làm.
// 2) Không có cách xem dạng cột - web (garage/_trend_chart.blade.php) có nút
//    chuyển line/bar. Thêm toggle nhỏ cạnh giá trị đầu bảng.
export interface LineTrendPoint {
  label: string;
  value: number;
}

const CHART_HEIGHT = 120;
// Đệm ngang nhỏ - KHÔNG phải lề trục Y (rà soát 18/8, user báo ảnh chụp: một
// khối hình chữ nhật đứng "lỗi" bên trái biểu đồ). Nguyên nhân: bản trước
// chừa hẳn 42px lề trái để dành chỗ vẽ nhãn min/max, nhưng chữ lại được vẽ
// ở HÀNG RIÊNG bên dưới chart chứ không vẽ vào lề đó -> 42px trống trơn,
// cộng với cạnh khép thẳng đứng của vùng area-fill đúng tại mép lề đó tạo ra
// đúng hình khối chữ nhật user thấy. Bỏ hẳn lề trục Y, biểu đồ tràn hết chiều
// rộng thật, chỉ chừa đệm nhỏ 2 đầu để điểm neo (circle marker) không bị cắt
// nửa ở sát mép canvas.
const H_PAD = 8; // >= r=7 của circle marker ngoài cùng, không cho viền bị cắt sát mép

type ChartMode = 'line' | 'bar';

export default function LineTrendChart({
  points, color, valueFormatter, emptyText, headerLabel, summaryValue,
}: {
  points: LineTrendPoint[];
  color: string;
  valueFormatter: (v: number) => string;
  emptyText?: string;
  headerLabel?: string;
  // Số hiển thị bên phải khi KHÔNG chạm - mặc định là giá trị điểm cuối
  // (hợp lý cho chuỗi "giá trị hiện tại", vd tiêu hao lần đổ gần nhất, điểm
  // sức khoẻ mới nhất). Với biểu đồ TỔNG theo kỳ (14 ngày, theo tháng), điểm
  // cuối có thể = 0 (hôm nay/tháng này chưa có dữ liệu) trong khi headerLabel
  // lại ghi "...14 ngày qua"/"...theo tháng" - hiện "0" cạnh nhãn đó đọc như
  // lỗi (user báo 18/8: "luôn hiện 0"). Cho phép caller truyền tổng/số đại
  // diện đúng nghĩa headerLabel thay vì mặc định lấy điểm cuối.
  summaryValue?: number;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ChartMode>('line');

  if (points.length < 2) {
    return (
      <View style={{ height: CHART_HEIGHT + 40, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{emptyText ?? '—'}</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const vMax = Math.max(...values);
  const vMin = Math.min(...values);
  const pad = Math.max(0.1, (vMax - vMin) * 0.15);
  const scaleMax = vMax + pad;
  // Cột luôn neo đáy = 0 (đúng trực giác so sánh độ cao cột); đường thì thu
  // hẹp quanh khoảng dữ liệu thật để thấy rõ biến động (giữ hành vi cũ).
  const scaleMin = mode === 'bar' ? 0 : Math.max(0, vMin - pad);
  const n = points.length;
  const plotWidth = Math.max(0, width - H_PAD * 2);

  const toX = (i: number) => H_PAD + (n === 1 ? plotWidth / 2 : (i / (n - 1)) * plotWidth);
  const toY = (v: number) =>
    CHART_HEIGHT - ((v - scaleMin) / (scaleMax - scaleMin || 1)) * CHART_HEIGHT;
  const linePoints = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const areaPoints = `${toX(0)},${CHART_HEIGHT} ${linePoints} ${toX(n - 1)},${CHART_HEIGHT}`;
  const barWidth = n > 0 ? Math.max(4, Math.min(28, (plotWidth / n) * 0.5)) : 0;

  const latest = points[n - 1];
  const defaultValue = summaryValue ?? latest.value;
  const touched = touchIndex !== null ? points[touchIndex] : null;
  const displayValue = touched ? touched.value : defaultValue;
  const nearestIndex = (x: number) => {
    if (plotWidth <= 0) return 0;
    const frac = Math.max(0, Math.min(1, (x - H_PAD) / plotWidth));
    return Math.round(frac * (n - 1));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {touched ? touched.label : (headerLabel ?? '')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: touched ? colors.text : color, fontSize: 15, fontWeight: '700' }}>
            {valueFormatter(displayValue)}
          </Text>
          <View style={{ flexDirection: 'row', backgroundColor: colors.border, borderRadius: 7, padding: 2 }}>
            {(['line', 'bar'] as ChartMode[]).map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={{
                  paddingHorizontal: 7,
                  paddingVertical: 4,
                  borderRadius: 5,
                  backgroundColor: mode === m ? color : 'transparent',
                }}
              >
                <FontAwesome5
                  name={m === 'line' ? 'chart-line' : 'chart-bar'}
                  size={10}
                  color={mode === m ? colors.card : colors.textSecondary}
                  solid
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {width > 0 && (
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => setTouchIndex(nearestIndex(e.nativeEvent.locationX))}
          onResponderMove={(e) => setTouchIndex(nearestIndex(e.nativeEvent.locationX))}
        >
          <Svg width={width} height={CHART_HEIGHT}>
            <Line x1={0} y1={1} x2={width} y2={1} stroke={colors.border} strokeWidth={1} />
            <Line x1={0} y1={CHART_HEIGHT - 1} x2={width} y2={CHART_HEIGHT - 1} stroke={colors.border} strokeWidth={1} />

            {mode === 'line' ? (
              <>
                <Polygon points={areaPoints} fill={color} fillOpacity={0.12} stroke="none" />
                <Polyline points={linePoints} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                <Circle cx={toX(n - 1)} cy={toY(latest.value)} r={7} fill={colors.card} />
                <Circle cx={toX(n - 1)} cy={toY(latest.value)} r={5} fill={color} />
                {touched && touchIndex !== null && (
                  <>
                    <Line x1={toX(touchIndex)} y1={0} x2={toX(touchIndex)} y2={CHART_HEIGHT} stroke={colors.textSecondary} strokeWidth={1} opacity={0.5} />
                    <Circle cx={toX(touchIndex)} cy={toY(touched.value)} r={7} fill={colors.card} />
                    <Circle cx={toX(touchIndex)} cy={toY(touched.value)} r={5} fill={colors.text} />
                  </>
                )}
              </>
            ) : (
              points.map((p, i) => {
                const y = toY(p.value);
                const isActive = touchIndex === i || (touchIndex === null && i === n - 1);
                return (
                  <Rect
                    key={i}
                    x={toX(i) - barWidth / 2}
                    y={y}
                    width={barWidth}
                    height={Math.max(1, CHART_HEIGHT - y)}
                    rx={3}
                    fill={color}
                    fillOpacity={isActive ? 1 : 0.45}
                  />
                );
              })
            )}
          </Svg>
        </View>
      )}

      {/* Chỉ còn 1 hàng mốc thời gian đầu/cuối (trục X). Bỏ hẳn hàng số
          min/max trước đây - 2 con số nổi trơ trọi không rõ là "cận trên/dưới
          trục" (user báo: nhìn không hiểu number đó nghĩa là gì). Giá trị cụ
          thể của MỌI điểm đã xem được qua chạm (touch-to-scrub) + đầu bài đã
          có headline number (giá trị mới nhất/tổng kỳ) ở hàng trên cùng. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{points[0].label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{points[n - 1].label}</Text>
      </View>
    </View>
  );
}
