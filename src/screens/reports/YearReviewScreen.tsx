import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { formatVND } from '../../utils/format';

/* Dark navy card matching web design */
const NAVY = '#0b1220';
const AMBER = '#F59E0B';
const AMBER_LIGHT = '#fcd34d';
const SLATE = '#93a4c0';
const WHITE = '#e8eef9';

function fmt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (isNaN(v)) return '—';
  return v.toLocaleString('vi-VN');
}
function fmtLit(n: number | null | undefined): string {
  if (n == null) return '—';
  return Number(n).toFixed(1).replace('.0', '') + ' L';
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{
      flex: 1, backgroundColor: 'rgba(255,255,255,0.055)',
      borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
      padding: 12,
    }}>
      <Text style={{ color: SLATE, fontSize: 11, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color: WHITE, fontWeight: '700', fontSize: 18 }}>{value}</Text>
      {sub && <Text style={{ color: SLATE, fontSize: 11, marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

export default function YearReviewScreen() {
  const route = useRoute<any>();
  const { yr, year } = route.params ?? {};

  const km = yr?.km ?? null;
  const fuelCost = yr?.fuel_cost ?? null;
  const liters = yr?.liters ?? null;
  const fillCount = yr?.fill_count ?? null;
  const serviceCost = yr?.service_cost ?? null;
  const serviceCount = yr?.service_count ?? null;
  const topStation = yr?.top_station ?? null;
  const hasData = km != null || fuelCost != null;

  if (!hasData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: NAVY, justifyContent: 'center', alignItems: 'center', padding: 24 }} edges={['bottom']}>
        <FontAwesome5 name="calendar-alt" size={48} color={SLATE} />
        <Text style={{ color: SLATE, fontSize: 15, marginTop: 12, textAlign: 'center' }}>
          Chưa có dữ liệu cho năm này.
        </Text>
      </SafeAreaView>
    );
  }

  const totalCost = (Number(fuelCost ?? 0) + Number(serviceCost ?? 0)) || null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: NAVY }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header brand */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: WHITE, fontWeight: '800', fontSize: 22, letterSpacing: -0.5 }}>
            Note<Text style={{ color: AMBER }}>Dri</Text>
          </Text>
          <Text style={{ color: AMBER_LIGHT, fontWeight: '800', fontSize: 16, letterSpacing: 1 }}>
            {year}
          </Text>
        </View>

        {/* Hero: km đã đi */}
        {km != null && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: SLATE, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              Tổng quãng đường
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Text style={{ color: WHITE, fontWeight: '800', fontSize: 48, lineHeight: 52 }}>
                {fmt(km)}
              </Text>
              <Text style={{ color: SLATE, fontWeight: '600', fontSize: 18, paddingBottom: 6 }}>km</Text>
            </View>
          </View>
        )}

        {/* Grid 2x2 */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          {fuelCost != null && (
            <Tile
              label="Tiền xăng"
              value={formatVND(fuelCost)}
              sub={liters != null ? fmtLit(liters) + (fillCount != null ? ` · ${fillCount} lần` : '') : undefined}
            />
          )}
          {serviceCost != null && (
            <Tile
              label="Bảo dưỡng"
              value={formatVND(serviceCost)}
              sub={serviceCount != null ? `${serviceCount} lần` : undefined}
            />
          )}
        </View>

        {totalCost != null && (
          <View style={{ gap: 10, marginBottom: 10 }}>
            <Tile label="Tổng chi phí cả năm" value={formatVND(totalCost)} />
          </View>
        )}

        {/* Top station */}
        {topStation && (
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.055)',
            borderRadius: 14, borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
          }}>
            <FontAwesome5 name="gas-pump" size={16} color={AMBER} solid />
            <View style={{ flex: 1 }}>
              <Text style={{ color: SLATE, fontSize: 11 }}>Điểm tiếp nhiên liệu chính</Text>
              <Text style={{ color: WHITE, fontWeight: '700', fontSize: 14, marginTop: 2 }}>{topStation}</Text>
            </View>
          </View>
        )}

        {/* Footer */}
        <Text style={{ color: SLATE, fontSize: 11, textAlign: 'center', marginTop: 28, letterSpacing: 0.3 }}>
          notedri.com · Quản lý xe thông minh
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
