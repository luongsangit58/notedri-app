import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import dayjs from 'dayjs';
import { DailyTrendPoint, TrendMetric } from '../../services/obd/sessionTrend';
import { useColors } from '../../utils/theme';

/**
 * Bar chart xu hướng theo ngày tự vẽ bằng View thuần (quyết định 15/7: không thêm
 * thư viện chart để còn lên bản qua OTA update, không phải build lại native).
 *
 * Quy ước đọc được (theo dataviz checklist):
 * - Thang đo min-max CÓ NHÃN hai đầu trục (giá trị hẹp như điện áp 13.9-14.5V mà
 *   ép về gốc 0 thì mọi cột cao bằng nhau - vô dụng; đã ghi nhãn thì không gây lừa).
 * - Ngày KHÔNG có phiên vẽ vạch mờ sát đáy, KHÔNG phải cột 0 ("không đo" ≠ "đo ra 0").
 * - Không đánh số lên từng cột: chạm 1 cột để xem ngày + giá trị ở góc phải header.
 */

type Props = {
  points: DailyTrendPoint[];
  metric: TrendMetric;
  title: string;
  unit?: string;
};

const CHART_HEIGHT = 72;

export default function ObdTrendChart({ points, metric, title, unit = '' }: Props) {
  const colors = useColors();
  const [selected, setSelected] = useState<number | null>(null);

  const { min, max, hasData } = useMemo(() => {
    const values = points.map((p) => p[metric]).filter((v): v is number => v !== null);
    if (!values.length) return { min: 0, max: 0, hasData: false };
    return { min: Math.min(...values), max: Math.max(...values), hasData: true };
  }, [points, metric]);

  if (!hasData) return null;

  // Cao nhất 100%, thấp nhất 15% (vẫn thấy cột, phân biệt được với vạch "không đo").
  // Chỉ áp dụng cho giá trị > 0 - giá trị 0 THẬT có nhánh vẽ riêng (xem zeroBar
  // bên dưới, không đi qua hàm này). Sửa lỗi (phản hồi 15/7): khi max===min (VD
  // chỉ có 1 ngày dữ liệu, hoặc mọi ngày quan sát được đều bằng nhau) code cũ trả
  // thẳng 100% - khiến 1 điểm dữ liệu duy nhất luôn bị vẽ như đỉnh cao nhất từng
  // có. Giờ vẽ mức vừa phải (60%) cho trường hợp này thay vì giả vờ đó là kỷ lục.
  const heightPct = (v: number): number =>
    max === min ? 60 : 15 + ((v - min) / (max - min)) * 85;

  const fmt = (v: number): string => `${v}${unit}`;

  const selPoint = selected !== null ? points[selected] : null;
  const selValue = selPoint ? selPoint[metric] : null;
  const latest = [...points].reverse().find((p) => p[metric] !== null);

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>
        <Text style={[styles.headerValue, { color: colors.text }]}>
          {selPoint && selValue !== null
            ? `${dayjs(selPoint.date).format('DD/MM')}: ${fmt(selValue)}`
            : latest ? fmt(latest[metric]!) : ''}
        </Text>
      </View>

      <View style={styles.plotRow}>
        {/* Nhãn 2 đầu thang đo - bắt buộc vì trục không xuất phát từ 0 */}
        <View style={styles.axis}>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{fmt(max)}</Text>
          <Text style={[styles.axisText, { color: colors.textSecondary }]}>{fmt(min)}</Text>
        </View>

        <View style={styles.bars}>
          {points.map((p, i) => {
            const v = p[metric];
            return (
              <Pressable
                key={p.date}
                style={styles.slot}
                onPress={() => setSelected(selected === i ? null : i)}
                hitSlop={{ top: 8, bottom: 8 }}
              >
                {v === null ? (
                  // Không đo - vạch xám mờ, KHÁC màu với "0 thật" bên dưới để không lẫn.
                  <View style={[styles.noData, { backgroundColor: colors.border }]} />
                ) : v === 0 ? (
                  // 0 THẬT (VD "0 mã lỗi" - tin tốt) - cột thấp nhưng CÓ MÀU chính,
                  // phân biệt rõ với "không đo" (xám mờ) mà không giả vờ cao như đỉnh.
                  <View style={[styles.zeroBar, { backgroundColor: selected === i ? colors.text : colors.primary }]} />
                ) : (
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${heightPct(v)}%`,
                        backgroundColor: selected === i ? colors.text : colors.primary,
                      },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Nhãn ngày thưa (mỗi ~1/4 trục) - 30 nhãn chồng chữ thì không đọc được gì */}
      <View style={styles.dateRow}>
        {[0, Math.floor(points.length / 2), points.length - 1].map((i) => (
          <Text key={i} style={[styles.axisText, { color: colors.textSecondary }]}>
            {dayjs(points[i].date).format('DD/MM')}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 14, gap: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 12, fontWeight: '500' },
  headerValue: { fontSize: 14, fontWeight: '700' },
  plotRow: { flexDirection: 'row', gap: 8 },
  axis: { justifyContent: 'space-between', height: CHART_HEIGHT, alignItems: 'flex-end' },
  axisText: { fontSize: 10 },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT, gap: 2 },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { alignSelf: 'stretch', borderTopLeftRadius: 3, borderTopRightRadius: 3, maxWidth: 24 },
  noData: { alignSelf: 'stretch', height: 3, borderRadius: 2, opacity: 0.6, maxWidth: 24 },
  // Cao hơn noData (6 so với 3) + KHÔNG giảm opacity - "đo được, bằng 0" phải rõ
  // ràng hơn "không đo được gì", dù cả 2 đều là cột thấp gần đáy.
  zeroBar: { alignSelf: 'stretch', height: 6, borderRadius: 2, maxWidth: 24 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 36 },
});
