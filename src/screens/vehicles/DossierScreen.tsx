import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Share,
  ActivityIndicator, SafeAreaView, Alert, Clipboard,
} from 'react-native';
import client from '../../api/client';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { vehiclesApi } from '../../api/vehicles';
import { servicesApi } from '../../api/services';
import { useColors } from '../../utils/theme';
import { formatVND, formatKm } from '../../utils/format';
import dayjs from 'dayjs';
import { useT } from '../../i18n';

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
  tank_capacity_l?: number | string | null;
  consumption_official?: number | string | null;
  ngay_mua?: string | null;
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
  const colors = useColors();
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
  const colors = useColors();
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
  const colors = useColors();
  const t = useT();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { vehicleId } = route.params as { vehicleId: number };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [services, setServices] = useState<ServiceLog[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

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
        if (!cancelled) setError(e?.message ?? t('common.error_generic'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [vehicleId]);

  const handleShare = async () => {
    if (!vehicle) return;
    const name = vehicle.ten ?? vehicle.name ?? t('dossier.my_vehicle');
    const plate = vehicle.bien_so ?? vehicle.license_plate ?? '';
    const odoNum = Number(vehicle.odo_hien_tai ?? vehicle.current_odometer ?? 0);
    const count = services.length;
    const totalCost = services.reduce((s, r) => s + serviceCost(r), 0);
    if (shareUrl) {
      await Share.share({
        message: t('dossier.share_summary', { name, plate: plate ? ` (${plate})` : '', odo: formatKm(odoNum), count, cost: formatVND(totalCost), url: shareUrl }),
        url: shareUrl,
      });
    } else {
      await Share.share({
        message: `${t('common.vehicle')}: ${name}${plate ? ` (${plate})` : ''}\nODO: ${formatKm(odoNum)}\n${formatVND(totalCost)}\nNoteDri`,
      });
    }
  };

  const handleGenerateLink = async () => {
    setShareLoading(true);
    try {
      const res = await client.post(`/vehicles/${vehicleId}/share-token`, { enable: true });
      const url = res.data?.data?.share_url ?? null;
      setShareUrl(url);
      if (url) {
        Alert.alert(
          t('dossier.link_ready_title'),
          t('dossier.link_ready_msg', { url }),
          [
            { text: t('dossier.link_copy'), onPress: () => Clipboard.setString(url) },
            { text: t('dossier.link_share'), onPress: () => Share.share({ message: url, url }) },
            { text: t('dossier.link_close') },
          ],
        );
      }
    } catch {
      Alert.alert(t('common.error'), t('dossier.link_error'));
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevokeLink = async () => {
    Alert.alert(t('dossier.revoke_link_title'), t('dossier.revoke_link_msg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('dossier.revoke_link_btn'), style: 'destructive', onPress: async () => {
          await client.post(`/vehicles/${vehicleId}/share-token`, { enable: false });
          setShareUrl(null);
        },
      },
    ]);
  };

  /* ─── loading / error ─── */
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ color: colors.textSecondary, marginTop: 12 }}>{t('dossier.loading')}</Text>
      </SafeAreaView>
    );
  }

  if (error || !vehicle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>{t('dossier.error_title')}</Text>
        <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>{error}</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ marginTop: 20, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10 }}>
          <Text style={{ color: colors.text }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const odo = Number(vehicle.odo_hien_tai ?? vehicle.current_odometer ?? 0);
  const totalCost = services.reduce((s, r) => s + serviceCost(r), 0);
  const healthScore: number | null = health?.score?.total ?? health?.health_score ?? null;
  const actualConsumption: number | null = health?.data?.consumption ?? null;
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
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{t('dossier.title')}</Text>
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
                {vehicle.ten ?? vehicle.name ?? t('dossier.my_vehicle')}
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
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {vehicle.fuel_type}
                      {vehicle.tank_capacity_l ? ` · ${t('dossier.tank_label')} ${vehicle.tank_capacity_l}L` : ''}
                    </Text>
                  </View>
                ) : null}
                {vehicle.consumption_official != null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <FontAwesome5 name="chart-bar" size={12} color={colors.textSecondary} solid />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {t('dossier.consumption_official_label')}: {vehicle.consumption_official} L/100km
                    </Text>
                  </View>
                ) : null}
                {vehicle.ngay_mua ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <FontAwesome5 name="calendar-alt" size={12} color={colors.textSecondary} solid />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                      {t('dossier.purchase_date_label')}: {dayjs(vehicle.ngay_mua).format('DD/MM/YYYY')}
                    </Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <FontAwesome5 name="road" size={12} color={colors.primary} solid />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>
                    ODO: {formatKm(odo)}
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

        {/* Stat cards */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            <StatCard
              label={t('dossier.total_service_cost')}
              value={formatVND(totalCost)}
              accent={colors.warning}
            />
            <StatCard
              label={t('dossier.service_count')}
              value={String(services.length)}
              accent={colors.success}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flex: 1 }}>
            <StatCard
              label="ODO"
              value={odo >= 1000 ? `${(odo / 1000).toFixed(0)}k km` : `${odo} km`}
              accent={colors.primary}
            />
            {healthScore != null ? (
              <StatCard
                label={t('dossier.health_score')}
                value={`${healthScore}/100`}
                accent={healthColor}
              />
            ) : (
              <StatCard
                label={t('vehicles.fuel_type_label')}
                value={vehicle.fuel_type ?? '—'}
                accent={colors.textSecondary}
              />
            )}
          </View>
        </View>

        {/* Service history */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FontAwesome5 name="wrench" size={14} color={colors.text} solid />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
              {t('dossier.service_history_title')}
            </Text>
          </View>
          {services.length === 0 ? (
            <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: 16 }}>
              {t('dossier.service_history_empty')}
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
                      {cost > 0 ? formatVND(cost) : '—'}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                    {serviceName(svc)}
                  </Text>
                  {odoVal != null && odoVal > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <FontAwesome5 name="road" size={11} color={colors.textSecondary} solid />
                      <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                        {formatKm(odoVal)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Share / public link buttons */}
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
        padding: 12, gap: 8,
      }}>
        {/* Quick share (text summary) */}
        <TouchableOpacity
          onPress={handleShare}
          style={{
            backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <FontAwesome5 name="share-alt" size={14} color={colors.primaryText} solid />
          <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 14 }}>
            {shareUrl ? t('dossier.share_with_link') : t('dossier.share_summary')}
          </Text>
        </TouchableOpacity>

        {/* Public link row */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {shareUrl ? (
            <>
              <TouchableOpacity
                onPress={() => Share.share({ message: shareUrl, url: shareUrl })}
                style={{
                  flex: 1, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderWidth: 1, borderColor: colors.border,
                }}>
                <FontAwesome5 name="link" size={12} color={colors.primary} solid />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>{t('dossier.copy_link')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleRevokeLink}
                style={{
                  backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
                  borderWidth: 1, borderColor: colors.error + '66',
                }}>
                <FontAwesome5 name="unlink" size={14} color={colors.error} solid />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              onPress={handleGenerateLink}
              disabled={shareLoading}
              style={{
                flex: 1, backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                borderWidth: 1, borderColor: colors.border, opacity: shareLoading ? 0.6 : 1,
              }}>
              {shareLoading
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <>
                    <FontAwesome5 name="link" size={12} color={colors.textSecondary} solid />
                    <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('dossier.create_public_link')}</Text>
                  </>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
