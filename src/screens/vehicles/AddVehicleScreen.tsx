import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCreateVehicle } from '../../hooks/useVehicles';
import { useSendTransferRequest } from '../../hooks/useVehicleTransfer';
import { useAuthStore } from '../../store/authStore';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { normalizeSearch } from '../../utils/text';
import { useT } from '../../i18n';
import VehicleMoreFields, { VehicleExtra, EMPTY_VEHICLE_EXTRA, extraToPayload } from '../../components/VehicleMoreFields';
import AppBgPattern from '../../components/AppBgPattern';
import type { VehiclePhoto } from '../../api/vehicles';

// ── Types ──────────────────────────────────────────────────────────────────
// Chỉ 2 loại như web: ô tô + xe máy. Xe điện KHÔNG phải loại riêng (nhận biết qua
// nhiên liệu "Điện"/spec is_ev). DB lưu vehicle_type = 'oto' | 'xemay'.
type VehicleType = 'oto' | 'xe_may';
const dbVehicleType = (t: VehicleType) => (t === 'xe_may' ? 'xemay' : 'oto');
type Brand  = { id: number; name: string; color?: string };
type VModel = { id: number; brand_id: number; name: string; type: string };
type Spec   = { id: number; model_id: number; version?: string; year_from?: number; year_to?: number;
                 is_ev: boolean; is_hybrid?: boolean; tank?: number; comb?: number; battery?: number; range_km?: number };

// #26 (brainstorm 14/7): sắp hãng phổ biến ở VN lên đầu danh sách thay vì thứ
// tự DB (alphabet/insertion) - giảm thời gian cuộn/tìm cho phần lớn user. Hãng
// KHÔNG nằm trong danh sách vẫn hiển thị đầy đủ, chỉ xếp SAU theo alphabet -
// đây là thứ tự tham khảo thông thường, không phải số liệu thị phần chính xác.
const POPULAR_BRANDS_OTO = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Mitsubishi', 'Ford', 'VinFast',
  'Suzuki', 'Isuzu', 'Chevrolet', 'Nissan', 'Peugeot', 'Mercedes-Benz', 'BMW', 'Audi', 'Lexus', 'Subaru',
];
const POPULAR_BRANDS_XEMAY = ['Honda', 'Yamaha', 'SYM', 'Piaggio', 'Suzuki', 'VinFast', 'Kymco'];

function sortByPopularity(brands: Brand[], popularList: string[]): Brand[] {
  const rank = (name: string) => {
    const idx = popularList.findIndex((p) => p.toLowerCase() === name.toLowerCase());
    return idx === -1 ? Infinity : idx;
  };
  return [...brands].sort((a, b) => {
    const ra = rank(a.name);
    const rb = rank(b.name);
    return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
  });
}

// ── Picker Modal ────────────────────────────────────────────────────────────
function PickerModal<T extends { id: number; name: string }>({
  visible, title, items, onSelect, onClose,
}: {
  visible: boolean;
  title: string;
  items: T[];
  onSelect: (item: T) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = useT();
  const [q, setQ] = useState('');
  const filtered = useMemo(
    () => q.trim()
      ? items.filter(i => normalizeSearch(String(i?.name ?? '')).includes(normalizeSearch(q)))
      : items,
    [items, q],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <FontAwesome5 name="arrow-left" size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, flex: 1 }}>{title}</Text>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface }}>
          <TextInput
            style={{
              backgroundColor: colors.background,
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
              fontSize: 14, color: colors.text, borderWidth: 1, borderColor: colors.border,
            }}
            placeholder={t('add_vehicle.search_placeholder')}
            placeholderTextColor={colors.textSecondary}
            value={q}
            onChangeText={setQ}
            autoFocus
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={i => String(i.id)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => { onSelect(item); setQ(''); }}
              style={{
                paddingHorizontal: 16, paddingVertical: 14,
                borderBottomWidth: 1, borderBottomColor: colors.border,
              }}>
              <Text style={{ color: colors.text, fontSize: 15 }}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 24 }}>
              {t('add_vehicle.not_found')}
            </Text>
          }
        />
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function AddVehicleScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const token = useAuthStore((s) => s.token);
  const createVehicle = useCreateVehicle();
  const sendTransferRequest = useSendTransferRequest();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  // Loại nhiên liệu: danh sách TĨNH khớp web (không lấy từ bảng giá xăng dầu).
  const FUEL_OPTIONS: { value: string; label: string }[] = [
    { value: 'Xăng',   label: t('vehicles.fuel_petrol') },
    { value: 'Dầu',    label: t('vehicles.fuel_diesel') },
    { value: 'Điện',   label: t('vehicles.fuel_electric') },
    { value: 'Hybrid', label: t('vehicles.fuel_hybrid') },
    { value: 'Khác',   label: t('vehicles.fuel_other') },
  ];

  const inputStyle = {
    backgroundColor: colors.surface, color: colors.text, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  };
  const labelStyle = { color: colors.textSecondary, fontSize: 12, marginBottom: 4, marginTop: 4 };

  // ── Cascade data ──────────────────────────────────────────────────────────
  const cascadeQuery = useQuery({
    queryKey: ['vehicle-specs-cascade'],
    queryFn: () => client.get('/vehicle-specs/cascade').then(r => r.data?.data ?? { brands: [], models: [], specs: [] }),
    staleTime: 1000 * 60 * 60 * 6,
    retry: 0,
    enabled: !!token,
  });
  const allBrands: Brand[]  = Array.isArray(cascadeQuery.data?.brands) ? cascadeQuery.data.brands : [];
  const allModels: VModel[] = Array.isArray(cascadeQuery.data?.models) ? cascadeQuery.data.models : [];
  const allSpecs:  Spec[]   = Array.isArray(cascadeQuery.data?.specs) ? cascadeQuery.data.specs : [];
  const hasCascade = allBrands.length > 0;

  // ── Form state ────────────────────────────────────────────────────────────
  const [ten, setTen]               = useState('');
  const [bien_so, setBienSo]        = useState('');
  const [make, setMake]             = useState('');
  const [model, setModel]           = useState('');
  const [nam, setNam]               = useState('');
  const [fuel_type, setFuelType]    = useState('Xăng');
  const [odo_ban_dau, setOdoBanDau] = useState('');
  const [tank_capacity_l, setTankCapacity]         = useState('');
  const [consumption_official, setConsumptionOfficial] = useState('');
  const [is_default, setIsDefault]  = useState(false);
  const [extra, setExtra]           = useState<VehicleExtra>(EMPTY_VEHICLE_EXTRA);
  const [vehicle_spec_id, setVehicleSpecId] = useState<number | null>(null);
  const [showExtra, setShowExtra]   = useState(false);
  const [apiError, setApiError]     = useState<string | null>(null);
  const [photo, setPhoto]           = useState<VehiclePhoto | null>(null);

  // ── Cascade selection state ───────────────────────────────────────────────
  const [vehicleType, setVehicleType]   = useState<VehicleType>('oto');
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [selectedModel, setSelectedModel] = useState<VModel | null>(null);
  const [selectedSpec, setSelectedSpec]   = useState<Spec | null>(null);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // ── Derived cascade data ──────────────────────────────────────────────────
  const brandsForType = useMemo(() => {
    const dbType = dbVehicleType(vehicleType);
    const brandIds = new Set(allModels.filter(m => (m.type || 'oto') === dbType).map(m => m.brand_id));
    const filtered = allBrands.filter(b => brandIds.has(b.id));
    return sortByPopularity(filtered, dbType === 'xemay' ? POPULAR_BRANDS_XEMAY : POPULAR_BRANDS_OTO);
  }, [allBrands, allModels, vehicleType]);

  const modelsForBrand = useMemo(() => {
    if (!selectedBrand) return [];
    const dbType = dbVehicleType(vehicleType);
    return allModels.filter(m => m.brand_id === selectedBrand.id && (m.type || 'oto') === dbType);
  }, [allModels, selectedBrand, vehicleType]);

  const specsForModel = useMemo(() => {
    if (!selectedModel) return [];
    return allSpecs.filter(s => s.model_id === selectedModel.id);
  }, [allSpecs, selectedModel]);

  // ── Apply spec data ───────────────────────────────────────────────────────
  const applySpec = useCallback((spec: Spec, brand?: Brand | null, mdl?: VModel | null) => {
    setVehicleSpecId(spec.id);
    if (spec.tank)  setTankCapacity(String(spec.tank));
    if (spec.comb)  setConsumptionOfficial(String(spec.comb));
    if (spec.year_from) setNam(String(spec.year_from));
    if (brand)  setMake(brand.name);
    if (mdl)    setModel(mdl.name);
    // Xe điện -> tự chọn nhiên liệu "Điện" (khớp web).
    if (spec.is_ev) setFuelType('Điện');
    else if (spec.is_hybrid) setFuelType('Hybrid'); // xe hybrid -> tự chọn nhiên liệu "Hybrid" (khớp web)
    setSelectedSpec(spec);
  }, []);

  // When model selected and only 1 spec → auto-apply
  useEffect(() => {
    if (specsForModel.length === 1) {
      applySpec(specsForModel[0], selectedBrand, selectedModel);
    } else if (specsForModel.length > 1) {
      // Clear spec, let user pick version via year input or first spec chips
      setSelectedSpec(null);
      setVehicleSpecId(null);
      // Still fill make/model
      if (selectedBrand) setMake(selectedBrand.name);
      if (selectedModel) setModel(selectedModel.name);
    }
  }, [specsForModel]);

  // Reset downstream when type changes
  const onTypeChange = (ty: VehicleType) => {
    setVehicleType(ty);
    setSelectedBrand(null); setSelectedModel(null); setSelectedSpec(null);
    setMake(''); setModel(''); setNam('');
    setTankCapacity(''); setConsumptionOfficial(''); setVehicleSpecId(null);
  };

  // ── Fallback text search (when no cascade data or manual override) ─────────
  const [specQuery, setSpecQuery]   = useState('');
  const [showSpecSuggestions, setShowSpecSuggestions] = useState(false);
  const specSearch = useQuery({
    queryKey: ['vehicle-specs-search', specQuery],
    queryFn: () => client.get('/vehicle-specs/search', { params: { q: specQuery, limit: 8 } }).then(r => r.data?.data ?? []),
    enabled: !!token && !hasCascade && specQuery.length >= 2,
    staleTime: 1000 * 60 * 60,
    retry: 0,
  });
  const applySpecFromSearch = useCallback((spec: any) => {
    if (spec.id)   setVehicleSpecId(spec.id);
    if (spec.make) setMake(spec.make);
    if (spec.model) setModel(spec.model);
    if (spec.tank_capacity_l) setTankCapacity(String(spec.tank_capacity_l));
    if (spec.consumption_combined) setConsumptionOfficial(String(spec.consumption_combined));
    if (spec.year_from) setNam(String(spec.year_from));
    setShowSpecSuggestions(false); setSpecQuery('');
  }, []);
  // Guard: backend trả non-array (lỗi/shape lạ) -> tránh .map trên undefined khi render.
  const specResults: any[] = Array.isArray(specSearch.data) ? specSearch.data : [];

  // ── Photo picker ──────────────────────────────────────────────────────────
  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('common.error'), t('add_vehicle.photo_permission')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({ uri: asset.uri, type: asset.mimeType ?? 'image/jpeg', name: 'vehicle.jpg' });
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!ten.trim()) { Alert.alert(t('vehicles.missing_info_title'), t('vehicles.name_required_msg')); return; }
    setApiError(null);
    const payload: Record<string, any> = { ten: ten.trim(), fuel_type, is_default };
    payload.vehicle_type = dbVehicleType(vehicleType);
    if (bien_so.trim())           payload.bien_so     = bien_so.trim();
    if (make.trim())              payload.make        = make.trim();
    if (model.trim())             payload.model       = model.trim();
    if (nam.trim())               payload.nam         = parseInt(nam.trim(), 10);
    if (odo_ban_dau.trim())       payload.odo_ban_dau = parseInt(odo_ban_dau.trim(), 10);
    if (tank_capacity_l.trim())   payload.tank_capacity_l       = parseFloat(tank_capacity_l.trim());
    if (consumption_official.trim()) payload.consumption_official = parseFloat(consumption_official.trim());
    if (vehicle_spec_id)          payload.vehicle_spec_id = vehicle_spec_id;
    // Trường hồ sơ tuỳ chọn (màu, VIN, số máy, đại lý, ngày/giá mua, ghi chú) - bỏ giá trị rỗng.
    Object.entries(extraToPayload(extra)).forEach(([k, val]) => { if (val != null) payload[k] = val; });
    try {
      const result = await createVehicle.mutateAsync({ data: payload, photo: photo ?? undefined });
      // VIN #29/#30: cảnh báo KHÔNG CHẶN khi backend phát hiện VIN trùng xe khác -
      // xe vẫn được tạo bình thường. Premium: mời gửi yêu cầu xem lịch sử bảo
      // dưỡng (#30) ngay tại đây thay vì chỉ cảnh báo suông.
      if (result?.meta?.vin_duplicate) {
        const newVehicleId = result?.data?.id;
        if (isPremium && newVehicleId) {
          Alert.alert(t('vehicles.vin_duplicate_title'), t('vehicles.vin_duplicate_send_request'), [
            { text: t('common.cancel'), style: 'cancel', onPress: () => navigation.goBack() },
            {
              text: t('vehicles.vin_duplicate_send_request_btn'),
              onPress: () => {
                sendTransferRequest.mutate(newVehicleId, {
                  onSuccess: () => { Alert.alert(t('common.ok'), t('vehicles.vin_duplicate_request_sent')); navigation.goBack(); },
                  onError: (e: any) => { Alert.alert(t('common.error'), e?.response?.data?.message ?? t('vehicles.error_generic')); navigation.goBack(); },
                });
              },
            },
          ]);
        } else {
          Alert.alert(t('vehicles.vin_duplicate_title'), t('vehicles.vin_duplicate_warning'), [
            { text: t('common.ok'), onPress: () => navigation.goBack() },
          ]);
        }
        return;
      }
      navigation.goBack();
    } catch (err: any) {
      setApiError(err?.response?.data?.message ?? err?.response?.data?.error ?? t('vehicles.error_generic'));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const TYPES: { key: VehicleType; label: string; icon: string }[] = [
    { key: 'oto',     label: t('add_vehicle.type_car'),        icon: 'car-side' },
    { key: 'xe_may',  label: t('add_vehicle.type_motorcycle'), icon: 'motorcycle' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />

      {/* Brand picker modal */}
      <PickerModal
        visible={showBrandPicker}
        title={t('add_vehicle.select_brand')}
        items={brandsForType}
        onSelect={b => { setSelectedBrand(b); setSelectedModel(null); setSelectedSpec(null); setShowBrandPicker(false); setMake(b.name); setModel(''); setNam(''); setTankCapacity(''); setConsumptionOfficial(''); setVehicleSpecId(null); }}
        onClose={() => setShowBrandPicker(false)}
      />

      {/* Model picker modal */}
      <PickerModal
        visible={showModelPicker}
        title={t('add_vehicle.select_model')}
        items={modelsForBrand}
        onSelect={m => { setSelectedModel(m); setSelectedSpec(null); setShowModelPicker(false); setModel(m.name); setNam(''); setTankCapacity(''); setConsumptionOfficial(''); setVehicleSpecId(null); }}
        onClose={() => setShowModelPicker(false)}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {/* Error banner */}
        {apiError ? (
          <View style={{ backgroundColor: colors.error + '22', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: colors.error }}>
            <Text style={{ color: colors.error, fontSize: 14 }}>{apiError}</Text>
          </View>
        ) : null}

        {/* Tên xe */}
        <Text style={labelStyle}>{t('vehicles.name_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.name_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={ten} onChangeText={setTen} returnKeyType="next"
        />

        {/* Biển số */}
        <Text style={labelStyle}>{t('vehicles.plate_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.plate_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={bien_so} onChangeText={setBienSo} autoCapitalize="characters" returnKeyType="next"
        />

        {/* ── Cascade: loại xe ── */}
        <Text style={[labelStyle, { marginTop: 12 }]}>{t('add_vehicle.vehicle_type_label')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {TYPES.map(tp => {
            const active = vehicleType === tp.key;
            return (
              <TouchableOpacity
                key={tp.key}
                onPress={() => onTypeChange(tp.key)}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: 6, paddingVertical: 10, borderRadius: 10,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                }}>
                <FontAwesome5 name={tp.icon} size={12} color={active ? colors.primaryText : colors.textSecondary} solid />
                <Text style={{ fontSize: 12, fontWeight: active ? '700' : '400', color: active ? colors.primaryText : colors.textSecondary }}>
                  {tp.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Cascade: chọn hãng ── */}
        {hasCascade ? (
          <>
            <Text style={labelStyle}>{t('vehicles.make_label')}</Text>
            <TouchableOpacity
              onPress={() => brandsForType.length > 0 ? setShowBrandPicker(true) : null}
              style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }]}>
              <Text style={{ color: selectedBrand ? colors.text : colors.textSecondary, fontSize: 15, flex: 1 }}>
                {selectedBrand ? selectedBrand.name : (cascadeQuery.isLoading ? t('common.loading') : t('add_vehicle.select_brand_placeholder'))}
              </Text>
              {cascadeQuery.isLoading
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <FontAwesome5 name="chevron-down" size={13} color={colors.textSecondary} />}
            </TouchableOpacity>

            {/* Model picker */}
            {selectedBrand && (
              <>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
                <Text style={labelStyle}>{t('vehicles.model_label')}</Text>
                <TouchableOpacity
                  onPress={() => modelsForBrand.length > 0 ? setShowModelPicker(true) : null}
                  style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }]}>
                  <Text style={{ color: selectedModel ? colors.text : colors.textSecondary, fontSize: 15, flex: 1 }}>
                    {selectedModel ? selectedModel.name : (modelsForBrand.length === 0 ? t('add_vehicle.no_model_in_db') : t('add_vehicle.select_model_placeholder'))}
                  </Text>
                  {modelsForBrand.length > 0 && <FontAwesome5 name="chevron-down" size={13} color={colors.textSecondary} />}
                </TouchableOpacity>
              </>
            )}

            {/* Spec version chips - khi có nhiều phiên bản */}
            {selectedModel && specsForModel.length > 1 && (
              <>
                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
                <Text style={labelStyle}>{t('add_vehicle.version_label')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 8 }}>
                  {specsForModel.map(sp => {
                    const label = sp.version
                      ? (sp.year_from ? `${sp.version} (${sp.year_from}${sp.year_to && sp.year_to !== sp.year_from ? '-' + sp.year_to : ''})` : sp.version)
                      : sp.year_from
                        ? `${sp.year_from}${sp.year_to && sp.year_to !== sp.year_from ? '-' + sp.year_to : ''}`
                        : t('add_vehicle.unknown_year');
                    const active = selectedSpec?.id === sp.id;
                    return (
                      <TouchableOpacity
                        key={sp.id}
                        onPress={() => applySpec(sp, selectedBrand, selectedModel)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                          backgroundColor: active ? colors.primary : colors.surface,
                          borderWidth: 1, borderColor: active ? colors.primary : colors.border,
                        }}>
                        <Text style={{ color: active ? colors.primaryText : colors.textSecondary, fontSize: 13, fontWeight: active ? '700' : '400' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* Spec info card - khi đã chọn spec */}
            {selectedSpec && (
              <View style={{
                backgroundColor: colors.primary + '15', borderRadius: 12,
                padding: 12, marginTop: 8, marginBottom: 4,
                borderWidth: 1, borderColor: colors.primary + '44',
                flexDirection: 'row', flexWrap: 'wrap', gap: 12,
              }}>
                <FontAwesome5 name="check-circle" size={13} color={colors.primary} solid style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>
                    {t('add_vehicle.spec_filled')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {selectedSpec.tank && (
                      <Text style={{ color: colors.text, fontSize: 12 }}>{t('add_vehicle.spec_tank', { value: selectedSpec.tank })}</Text>
                    )}
                    {selectedSpec.comb && (
                      <Text style={{ color: colors.text, fontSize: 12 }}>{t('add_vehicle.spec_consumption', { value: selectedSpec.comb })}</Text>
                    )}
                    {selectedSpec.battery && (
                      <Text style={{ color: colors.text, fontSize: 12 }}>{t('add_vehicle.spec_battery', { value: selectedSpec.battery })}</Text>
                    )}
                    {selectedSpec.range_km && (
                      <Text style={{ color: colors.text, fontSize: 12 }}>{t('add_vehicle.spec_range', { value: selectedSpec.range_km })}</Text>
                    )}
                  </View>
                </View>
              </View>
            )}

            {/* Divider + manual fallback link */}
            <View style={{ marginTop: 12, marginBottom: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
                {t('add_vehicle.manual_fallback_hint')}
              </Text>
            </View>
          </>
        ) : (
          /* ── Fallback text search khi DB trống ── */
          <>
            <Text style={[labelStyle, { marginTop: 4 }]}>{t('vehicles.search_hint')}</Text>
            <TextInput
              style={inputStyle}
              placeholder={t('add_vehicle.search_example_placeholder')}
              placeholderTextColor={colors.textSecondary}
              value={specQuery}
              onChangeText={v => { setSpecQuery(v); setShowSpecSuggestions(true); }}
              returnKeyType="search"
            />
            {showSpecSuggestions && specQuery.length >= 2 && (
              <View style={{ backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                {specSearch.isLoading && <View style={{ padding: 12 }}><ActivityIndicator color={colors.primary} size="small" /></View>}
                {specResults.map((s: any) => (
                  <TouchableOpacity key={s.id} onPress={() => applySpecFromSearch(s)} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>{s.label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                      {s.tank_capacity_l ? t('add_vehicle.spec_tank_short', { size: s.tank_capacity_l }) : ''}
                      {s.consumption_combined ? ` · ${s.consumption_combined}L/100km` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
                {!specSearch.isLoading && specResults.length === 0 && specQuery.length >= 2 && (
                  <Text style={{ color: colors.textSecondary, padding: 12, fontSize: 13 }}>{t('add_vehicle.not_found_manual')}</Text>
                )}
              </View>
            )}
          </>
        )}

        {/* ── Hãng xe (text, auto-filled) ── */}
        <Text style={labelStyle}>{t('vehicles.make_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.make_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={make} onChangeText={setMake} returnKeyType="next"
        />

        {/* ── Model xe (text, auto-filled) ── */}
        <Text style={labelStyle}>{t('vehicles.model_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.model_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={model} onChangeText={setModel} returnKeyType="next"
        />

        {/* ── Năm sản xuất ── */}
        <Text style={labelStyle}>{t('vehicles.year_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.year_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={nam} onChangeText={setNam} keyboardType="numeric" returnKeyType="next"
        />

        {/* ── Loại nhiên liệu (danh sách tĩnh, khớp web) ── */}
        <Text style={labelStyle}>{t('vehicles.fuel_type_label')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, paddingVertical: 4 }}>
          {FUEL_OPTIONS.map((opt) => {
            const selected = fuel_type === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setFuelType(opt.value)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderWidth: 1, borderColor: selected ? colors.primary : colors.border,
                }}>
                <Text style={{ color: selected ? colors.primaryText : colors.textSecondary, fontSize: 13, fontWeight: selected ? '700' : '400' }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── ODO ban đầu ── */}
        <Text style={labelStyle}>{t('vehicles.odo_initial_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.odo_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={odo_ban_dau} onChangeText={setOdoBanDau} keyboardType="numeric" returnKeyType="done"
        />

        {/* ── Thông số xe (auto-filled từ spec) ── */}
        <Text style={labelStyle}>{t('vehicles.tank_capacity_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('add_vehicle.tank_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={tank_capacity_l} onChangeText={setTankCapacity} keyboardType="numeric" returnKeyType="done"
        />

        <Text style={labelStyle}>{t('vehicles.consumption_official_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('add_vehicle.consumption_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={consumption_official} onChangeText={setConsumptionOfficial} keyboardType="numeric" returnKeyType="done"
        />

        {/* ── Extra fields (collapsible) ── */}
        <TouchableOpacity
          onPress={() => setShowExtra(v => !v)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12,
            borderWidth: 1, borderColor: showExtra ? colors.primary : colors.border,
          }}>
          <View style={{
            width: 32, height: 32, borderRadius: 8,
            backgroundColor: colors.primary + '1f', alignItems: 'center', justifyContent: 'center',
          }}>
            <FontAwesome5 name="sliders-h" size={13} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
              {t('add_vehicle.more_info_title')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>
              {t('add_vehicle.more_info_subtitle')}
            </Text>
          </View>
          <FontAwesome5 name={showExtra ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textSecondary} />
        </TouchableOpacity>

        {showExtra && (
          <VehicleMoreFields value={extra} onChange={(patch) => setExtra(e => ({ ...e, ...patch }))} />
        )}

        {/* ── Ảnh xe ── */}
        <View style={{ marginBottom: 16 }}>
          <Text style={labelStyle}>{t('add_vehicle.photo_label')}</Text>
          <TouchableOpacity
            onPress={pickPhoto}
            style={{
              backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1,
              borderColor: colors.border, borderStyle: 'dashed', height: 120,
              alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="camera" size={24} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('add_vehicle.pick_photo')}</Text>
              </View>
            )}
          </TouchableOpacity>
          {photo && (
            <TouchableOpacity onPress={() => setPhoto(null)} style={{ marginTop: 6, alignSelf: 'flex-end' }}>
              <Text style={{ color: colors.error, fontSize: 12 }}>{t('add_vehicle.remove_photo')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Đặt làm mặc định ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.surface, borderRadius: 10,
          paddingHorizontal: 14, paddingVertical: 14, marginBottom: 24,
          borderWidth: 1, borderColor: colors.border,
        }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>{t('vehicles.set_default')}</Text>
          <Switch
            value={is_default} onValueChange={setIsDefault}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.text}
          />
        </View>

        {/* ── Submit ── */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={createVehicle.isPending}
          style={{
            backgroundColor: colors.primary, borderRadius: 12,
            paddingVertical: 16, alignItems: 'center',
            opacity: createVehicle.isPending ? 0.7 : 1,
          }}>
          {createVehicle.isPending
            ? <ActivityIndicator color={colors.primaryText} />
            : <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '700' }}>{t('vehicles.submit_add')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
