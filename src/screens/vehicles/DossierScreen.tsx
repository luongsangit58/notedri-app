import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Share,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { vehiclesApi } from '../../api/vehicles';
import { servicesApi } from '../../api/services';
import { colors } from '../../utils/colors';
import dayjs from 'dayjs';

/* ─── types ─── */
interface Vehicle {
  id: number;
  ten?: string;
  name?: string;
  bien_so?: string;
  license_plate?: string;
  make?: string;
  model?: string;
  nam?: number | string;
  year?: number | string;
  fuel_type?: string;
  odo_hien_tai?: number | string;
  current_odometer?: number | string;
}

interface ServiceLog {
  id: number;
  hang_muc?: string;
  service_type?: string;
  loai?: string;
  type?: string;
  chi_phi?: number | string;
  cost?: number | string;
  odometer?: number | string;
  ngay?: string;
  date?: string;
}

/* ─── helpers ─── */
function fmtCost(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')} tr`;
  return n.toLocaleString('vi-VN');
}

function fmtDate(d?: string): string {
  if (!d) return '—';
  return dayjs(d).format('DD/MM/YYYY');
}

function serviceDate(s: ServiceLog): string {
  return s.ngay ?? s.date ?? '';
}

function serviceName(s: ServiceLog): string {
  return s.hang_muc ?? s.service_type ?? '—';
}

function serviceType(s: ServiceLog): string {
  return s.loai ?? s.type ?? '';
}

function serviceCost(s: ServiceLog): number {
  return Number(s.chi_phi ?? s.cost ?? 0);
}

function serviceOdo(s: ServiceLog): number | null {
  const v = s.odometer;
  return v != null ? Number(v) : null;
}

/* ─── stat card ─── */
function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{
      flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12, alignItems: 'center',
    }}>
      <Text style={{ color: accent ?? colors.primary, fontWeight: '800', fontSize: 16 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 3, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

/* ─── type badge ─── */
function TypeBadge({ label }: { label: string }) {
  const bg = label === 'emergency' || label === 'khẩn cấp' ? colors.error + '33'
    : label === 'scheduled' || label === 'định kỳ' ? colors.primary + '33'
    : colors.surface;
  const fg = label === 'emergency' || label === 'khẩn cấp' ? colors.error
    : label === 'scheduled' || label === 'định kỳ' ? colors.primary
    : colors.textSecondary;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/* ─── screen ─── */
export default function DossierScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = route.params as { vehicleId: number };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [services, setServices] = useState<ServiceLog[]>([]);
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [vRes, s1Res, hRes] = await Promise.all([
          vehiclesApi.get(vehicleId),
          servicesApi.list(vehicleId, 1),
          vehiclesApi.health(vehicleId).catch(() => null),
        ]);

        if (cancelled) return;

        const v: Vehicle = vRes.data?.data ?? vRes.data ?? vRes;
        setVehicle(v);
        setHealth(hRes?.data?.data ?? hRes?.data ?? null);

        const page1Data = s1Res.data?.data ?? s1Res.data ?? [];
        const meta = s1Res.data?.meta ?? s1Res.data;
        const lastPage: number = meta?.last_page ?? 1;

        let allServices: ServiceLog[] = [...page1Data];

        if (lastPage >= 2) {
          const page2Res = await servicesApi.list(vehicleId, 2);
          if (!cancelled) {
            const page2Data = page2Res.data?.data ?? page2Res.data ?? [];
            allServices = [...allServices, ...page2Data];
          }
        }

        if (!cancelled) {
          // Sort by date newest first
          allServices.sort((a, b) => {
            const da = serviceDate(a);
            const db = serviceDate(b);
            return db.localeCompare(da);
          });
          setServices(allServices);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Lỗi tải dữ liệu');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [vehicleId]);

  const handleShare = async () => {
    if (!vehicle) return;
    const name = vehicle.ten ?? vehicle.name ?? 'Xe';
    const plate = vehicle.bien_so ?? vehicle.license_plate ?? '';
    const odo = Number(vehicle.odo_hien_tai ?? vehicle.current_odometer ?? 0).toLocaleString('vi-VN');
    const count = services.length;
    const totalCost = services.reduce((s, r) => s + serviceCost(r), 0);
    try {
      await Share.share({
        message: `Xe: ${name}${plate ? ` (${plate})` : ''}\nODO: ${odo} km\nBảo dưỡng: ${count} lần\nTổng chi bảo dưỡng: ${totalCost.toLocaleString('vi-VN')}đ\nNoteDri - Sổ tay xe điện tử`,
      });
    } catch (_) {}
  };

  /* ─── loading / error ─── */
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>Đang tải sổ tay xe...</Text>
      </SafeAreaView>
    );
  }

  if (error || !vehicle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Không tải được dữ liệu</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{error}</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 20, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 }}>
          <Text style={{ color: colors.text }}>Quay lại</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const odo = Number(vehicle.odo_hien_tai ?? vehicle.current_odometer ?? 0);
  const totalCost = services.reduce((s, r) => s + serviceCost(r), 0);
  const healthScore: number | null = health?.score?.total ?? health?.health_score ?? null;
  const healthColor = healthScore == null ? colors.textSecondary
    : healthScore >= 80 ? colors.success
    : healthScore >= 50 ? colors.warning
    : colors.error;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <FontAwesome5 name="book-open" size={16} color={colors.text} solid />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>Sổ tay xe</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ backgroundColor: colors.card, borderRadius: 20, width: 36, height: 36, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 18, lineHeight: 20 }}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Vehicle profile card */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>
                {vehicle.ten ?? vehicle.name ?? 'Xe của tôi'}
              </Text>
              {(vehicle.bien_so ?? vehicle.license_plate) ? (
                <View style={{
                  alignSelf: 'flex-start', marginTop: 6,
                  backgroundColor: colors.primary + '22', borderRadius: 8,
                  paddingHorizontal: 10, paddingVertical: 3,
                }}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
                    {vehicle.bien_so ?? vehicle.license_plate}
                  </Text>
                </View>
              ) : null}
              <View style={{ marginTop: 10, gap: 4 }}>
                {(vehicle.make || vehicle.model) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <FontAwesome5 name="car" size={12} color={colors.textSecondary} solid />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ')}
                      {(vehicle.nam ?? vehicle.year) ? ` · ${vehicle.nam ?? vehicle.year}` : ''}
                    </Text>
                  </View>
                ) : null}
                {vehicle.fuel_type ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <FontAwesome5 name="gas-pump" size={12} color={colors.textSecondary} solid />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{vehicle.fuel_type}</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FontAwesome5 name="road" size={12} color={colors.primary} solid />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
                    {odo.toLocaleString('vi-VN')} km
                  </Text>
                </View>
              </View>
            </View>
            {healthScore != null && (
              <View style={{
                width: 60, height: 60, borderRadius: 30,
                borderWidth: 3, borderColor: healthColor,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: colors.card, marginLeft: 12,
              }}>
                <Text style={{ color: healthColor, fontSize: 20, fontWeight: '800' }}>{healthScore}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 3 stat cards */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <StatCard
            label="Tổng chi bảo dưỡng"
            value={fmtCost(totalCost) + 'đ'}
            accent={colors.warning}
          />
          <StatCard
            label="Số lần BD"
            value={String(services.length)}
            accent={colors.success}
          />
          <StatCard
            label="ODO hiện tại"
            value={odo >= 1000 ? `${(odo / 1000).toFixed(0)}k km` : `${odo} km`}
            accent={colors.primary}
          />
        </View>

        {/* Service history */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FontAwesome5 name="wrench" size={14} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
              Lịch sử bảo dưỡng
            </Text>
          </View>
          {services.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 }}>
              Chưa có lịch sử bảo dưỡng nào.
            </Text>
          ) : (
            services.map((svc, idx) => {
              const cost = serviceCost(svc);
              const odoVal = serviceOdo(svc);
              const type = serviceType(svc);
              return (
                <View
                  key={svc.id ?? idx}
                  style={{
                    paddingVertical: 10,
                    borderTopWidth: idx > 0 ? 1 : 0,
                    borderTopColor: colors.border,
                  }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, width: 80 }}>
                      {fmtDate(serviceDate(svc))}
                    </Text>
                    {type ? <TypeBadge label={type} /> : null}
                    <Text style={{ color: cost > 0 ? colors.text : colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                      {cost > 0 ? `${fmtCost(cost)}đ` : '—'}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    {serviceName(svc)}
                  </Text>
                  {odoVal != null && odoVal > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <FontAwesome5 name="road" size={11} color={colors.textSecondary} solid />
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {odoVal.toLocaleString('vi-VN')} km
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Share button */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
        padding: 16,
      }}>
        <TouchableOpacity
          onPress={handleShare}
          style={{
            backgroundColor: colors.primary, borderRadius: 12, padding: 14,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <FontAwesome5 name="share-alt" size={16} color="#fff" solid />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Chia sẻ sổ tay xe</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
