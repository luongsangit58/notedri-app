import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle, Line, Polygon, Polyline } from 'react-native-svg';
import { useColors } from '../../utils/theme';

// Biểu đồ đường dùng chung, tự vẽ bằng react-native-svg (không thêm thư viện
// chart mới - giữ đúng quyết định 15/7 đã áp dụng cho VoltageChart/
// ObdTrendChart: charts tự vẽ để còn lên bản qua OTA, không phải build lại
// native). Cùng mark spec với VoltageChart (OBDTechnicalScreen): line 2px,
// area fill mờ ~12%, hairline gridline trên/dưới, điểm neo tại giá trị mới
// nhất kèm viền màu nền (surface ring), touch-to-scrub.
export interface LineTrendPoint {
  label: string;
  value: number;
}

const CHART_HEIGHT = 120;
const Y_AXIS_WIDTH = 42;

export default function LineTrendChart({
  points, color, valueFormatter, emptyText, headerLabel,
}: {
  points: LineTrendPoint[];
  color: string;
  valueFormatter: (v: number) => string;
  emptyText?: string;
  headerLabel?: string;
}) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

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
  const scaleMin = Math.max(0, vMin - pad);
  const n = points.length;
  const plotWidth = Math.max(0, width - Y_AXIS_WIDTH);

  const toX = (i: number) => Y_AXIS_WIDTH + (n === 1 ? 0 : (i / (n - 1)) * plotWidth);
  const toY = (v: number) =>
    CHART_HEIGHT - ((v - scaleMin) / (scaleMax - scaleMin || 1)) * CHART_HEIGHT;
  const linePoints = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const areaPoints = `${Y_AXIS_WIDTH},${CHART_HEIGHT} ${linePoints} ${width},${CHART_HEIGHT}`;

  const latest = points[n - 1];
  const touched = touchIndex !== null ? points[touchIndex] : null;
  const nearestIndex = (x: number) => {
    if (plotWidth <= 0) return 0;
    const frac = Math.max(0, Math.min(1, (x - Y_AXIS_WIDTH) / plotWidth));
    return Math.round(frac * (n - 1));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {touched ? touched.label : (headerLabel ?? '')}
        </Text>
        <Text style={{ color: touched ? colors.text : color, fontSize: 15, fontWeight: '700' }}>
          {valueFormatter((touched ?? latest).value)}
        </Text>
      </View>

      {width > 0 && (
        <View
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => setTouchIndex(nearestIndex(e.nativeEvent.locationX))}
          onResponderMove={(e) => setTouchIndex(nearestIndex(e.nativeEvent.locationX))}
          onResponderRelease={() => setTouchIndex(null)}
        >
          <Svg width={width} height={CHART_HEIGHT}>
            <Line x1={Y_AXIS_WIDTH} y1={1} x2={width} y2={1} stroke={colors.border} strokeWidth={1} />
            <Line x1={Y_AXIS_WIDTH} y1={CHART_HEIGHT - 1} x2={width} y2={CHART_HEIGHT - 1} stroke={colors.border} strokeWidth={1} />
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
          </Svg>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{valueFormatter(scaleMin)}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{valueFormatter(scaleMax)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{points[0].label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{points[n - 1].label}</Text>
      </View>
    </View>
  );
}
