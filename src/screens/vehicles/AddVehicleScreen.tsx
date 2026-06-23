import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Switch,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useCreateVehicle } from '../../hooks/useVehicles';
import { useFuelTypes } from '../../hooks/useFuelTypes';
import client from '../../api/client';

const colors = {
  background: '#121212',
  surface: '#1E1E1E',
  primary: '#E85D04',
  text: '#fff',
  textSecondary: '#9E9E9E',
  error: '#F44336',
};

const inputStyle = {
  backgroundColor: colors.surface,
  color: colors.text,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  marginBottom: 12,
  borderWidth: 1,
  borderColor: '#2E2E2E',
};

const labelStyle = {
  color: colors.textSecondary,
  fontSize: 12,
  marginBottom: 4,
  marginTop: 4,
};

export default function AddVehicleScreen() {
  const navigation = useNavigation<any>();
  const createVehicle = useCreateVehicle();
  const { data: fuelTypesRaw, isLoading: fuelTypesLoading } = useFuelTypes();

  const fuelTypes: any[] = Array.isArray(fuelTypesRaw)
    ? fuelTypesRaw.filter((ft: any) => ft.kich_hoat)
    : [];

  const [ten, setTen] = useState('');
  const [bien_so, setBienSo] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [nam, setNam] = useState('');
  const [fuel_type, setFuelType] = useState('');
  const [odo_ban_dau, setOdoBanDau] = useState('');
  const [tank_capacity_l, setTankCapacity] = useState('');
  const [consumption_official, setConsumptionOfficial] = useState('');
  const [is_default, setIsDefault] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [specQuery, setSpecQuery] = useState('');
  const [showSpecSuggestions, setShowSpecSuggestions] = useState(false);

  const specSearch = useQuery({
    queryKey: ['vehicle-specs-search', specQuery],
    queryFn: () =>
      client.get('/vehicle-specs/search', { params: { q: specQuery, limit: 8 } })
        .then(r => r.data?.data ?? []),
    enabled: specQuery.length >= 2,
    staleTime: 1000 * 60 * 60,
  });

  const applySpec = useCallback((spec: any) => {
    if (spec.make) setMake(spec.make);
    if (spec.model) setModel(spec.model);
    if (spec.tank_capacity_l) setTankCapacity(String(spec.tank_capacity_l));
    if (spec.consumption_combined) setConsumptionOfficial(String(spec.consumption_combined));
    if (spec.year_from) setNam(String(spec.year_from));
    setShowSpecSuggestions(false);
    setSpecQuery('');
  }, []);

  // Set default fuel type when fuel types load
  useEffect(() => {
    if (fuelTypes.length > 0 && fuel_type === '') {
      setFuelType(fuelTypes[0].ten);
    }
  }, [fuelTypes]);

  const handleSubmit = async () => {
    if (!ten.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên xe.');
      return;
    }

    setApiError(null);

    const payload: Record<string, any> = {
      ten: ten.trim(),
      fuel_type,
      is_default,
    };
    if (bien_so.trim()) payload.bien_so = bien_so.trim();
    if (make.trim()) payload.make = make.trim();
    if (model.trim()) payload.model = model.trim();
    if (nam.trim()) payload.nam = parseInt(nam.trim(), 10);
    if (odo_ban_dau.trim()) payload.odo_ban_dau = parseInt(odo_ban_dau.trim(), 10);
    if (tank_capacity_l.trim()) payload.tank_capacity_l = parseFloat(tank_capacity_l.trim());
    if (consumption_official.trim()) payload.consumption_official = parseFloat(consumption_official.trim());

    try {
      await createVehicle.mutateAsync(payload);
      navigation.goBack();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        'Có lỗi xảy ra. Vui lòng thử lại.';
      setApiError(msg);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">

        {apiError ? (
          <View style={{
            backgroundColor: '#2C1010',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.error,
          }}>
            <Text style={{ color: colors.error, fontSize: 14 }}>{apiError}</Text>
          </View>
        ) : null}

        <Text style={labelStyle}>Tên xe *</Text>
        <TextInput
          style={inputStyle}
          placeholder="Tên xe, VD: Honda Wave Alpha"
          placeholderTextColor={colors.textSecondary}
          value={ten}
          onChangeText={setTen}
          returnKeyType="next"
        />

        <Text style={labelStyle}>Biển số</Text>
        <TextInput
          style={inputStyle}
          placeholder="Biển số (tuỳ chọn)"
          placeholderTextColor={colors.textSecondary}
          value={bien_so}
          onChangeText={setBienSo}
          autoCapitalize="characters"
          returnKeyType="next"
        />

        {/* Spec autocomplete */}
        <Text style={labelStyle}>Tìm xe theo tên (gợi ý tự động)</Text>
        <TextInput
          style={inputStyle}
          placeholder="VD: Toyota Vios, Honda Wave..."
          placeholderTextColor={colors.textSecondary}
          value={specQuery}
          onChangeText={v => { setSpecQuery(v); setShowSpecSuggestions(true); }}
          returnKeyType="search"
        />
        {showSpecSuggestions && specQuery.length >= 2 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            {specSearch.isLoading && (
              <View style={{ padding: 12 }}><ActivityIndicator color={colors.primary} size="small" /></View>
            )}
            {(specSearch.data ?? []).map((s: any) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => applySpec(s)}
                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#333' }}>
                <Text style={{ color: colors.text, fontSize: 14 }}>{s.label}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                  {s.tank_capacity_l ? `Bình ${s.tank_capacity_l}L` : ''}
                  {s.consumption_combined ? ` · ${s.consumption_combined}L/100km` : ''}
                </Text>
              </TouchableOpacity>
            ))}
            {!specSearch.isLoading && (specSearch.data ?? []).length === 0 && specQuery.length >= 2 && (
              <Text style={{ color: colors.textSecondary, padding: 12, fontSize: 13 }}>Không tìm thấy — nhập tay bên dưới.</Text>
            )}
          </View>
        )}

        <Text style={labelStyle}>Hãng xe</Text>
        <TextInput
          style={inputStyle}
          placeholder="Hãng xe, VD: Honda, Toyota"
          placeholderTextColor={colors.textSecondary}
          value={make}
          onChangeText={setMake}
          returnKeyType="next"
        />

        <Text style={labelStyle}>Model</Text>
        <TextInput
          style={inputStyle}
          placeholder="Model, VD: Wave Alpha, Vios"
          placeholderTextColor={colors.textSecondary}
          value={model}
          onChangeText={setModel}
          returnKeyType="next"
        />

        <Text style={labelStyle}>Năm sản xuất</Text>
        <TextInput
          style={inputStyle}
          placeholder="Năm sản xuất (VD: 2020)"
          placeholderTextColor={colors.textSecondary}
          value={nam}
          onChangeText={setNam}
          keyboardType="numeric"
          returnKeyType="next"
        />

        <Text style={labelStyle}>Loại nhiên liệu</Text>
        {fuelTypesLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 12, alignSelf: 'flex-start' }} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 12 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {fuelTypes.map((ft: any) => {
              const selected = fuel_type === ft.ten;
              return (
                <TouchableOpacity
                  key={ft.id}
                  onPress={() => setFuelType(ft.ten)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: selected ? colors.primary : colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : '#2E2E2E',
                  }}>
                  <Text style={{
                    color: selected ? '#fff' : colors.textSecondary,
                    fontSize: 13,
                    fontWeight: selected ? '700' : '400',
                  }}>
                    {ft.ten}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <Text style={labelStyle}>ODO ban đầu</Text>
        <TextInput
          style={inputStyle}
          placeholder="ODO ban đầu (km)"
          placeholderTextColor={colors.textSecondary}
          value={odo_ban_dau}
          onChangeText={setOdoBanDau}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <Text style={labelStyle}>Dung tích bình xăng (L)</Text>
        <TextInput
          style={inputStyle}
          placeholder="VD: 40"
          placeholderTextColor={colors.textSecondary}
          value={tank_capacity_l}
          onChangeText={setTankCapacity}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <Text style={labelStyle}>Mức tiêu hao NSX công bố (L/100km)</Text>
        <TextInput
          style={inputStyle}
          placeholder="VD: 6.5"
          placeholderTextColor={colors.textSecondary}
          value={consumption_official}
          onChangeText={setConsumptionOfficial}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surface,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
          marginBottom: 24,
          borderWidth: 1,
          borderColor: '#2E2E2E',
        }}>
          <Text style={{ color: colors.text, fontSize: 15 }}>Đặt làm xe mặc định</Text>
          <Switch
            value={is_default}
            onValueChange={setIsDefault}
            trackColor={{ false: '#3A3A3A', true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={createVehicle.isPending}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            opacity: createVehicle.isPending ? 0.7 : 1,
          }}>
          {createVehicle.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Thêm xe</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
