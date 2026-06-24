import React, { useState, useEffect } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import { useVehicle, useUpdateVehicle, useDeleteVehicle } from '../../hooks/useVehicles';
import { useFuelTypes } from '../../hooks/useFuelTypes';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import { useColors } from '../../utils/theme';

export default function EditVehicleScreen() {
  const colors = useColors();
  const inputStyle = {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  };
  const labelStyle = {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
    marginTop: 4,
  };
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { vehicleId } = route.params;

  const { data: vehicleData, isLoading, isError, refetch } = useVehicle(vehicleId);
  const updateVehicle = useUpdateVehicle();
  const deleteVehicle = useDeleteVehicle();
  const { data: fuelTypesRaw, isLoading: fuelTypesLoading } = useFuelTypes();

  const fuelTypes: any[] = Array.isArray(fuelTypesRaw)
    ? fuelTypesRaw.filter((ft: any) => ft.kich_hoat)
    : [];

  const [ten, setTen] = useState('');
  const [bien_so, setBienSo] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [nam, setNam] = useState('');
  const [fuel_type, setFuelType] = useState('E5 RON 95-V');
  const [odo_ban_dau, setOdoBanDau] = useState('');
  const [tank_capacity_l, setTankCapacity] = useState('');
  const [consumption_official, setConsumptionOfficial] = useState('');
  const [is_default, setIsDefault] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (vehicleData && !initialized) {
      const v = vehicleData?.data ?? vehicleData;
      setTen(v?.ten ?? v?.name ?? '');
      setBienSo(v?.bien_so ?? v?.license_plate ?? '');
      setMake(v?.make ?? '');
      setModel(v?.model ?? '');
      setNam(v?.nam != null ? String(v.nam) : '');
      setFuelType(v?.fuel_type ?? 'E5 RON 95-V');
      setOdoBanDau(v?.odo_ban_dau != null ? String(v.odo_ban_dau) : '');
      setTankCapacity(v?.tank_capacity_l != null ? String(v.tank_capacity_l) : '');
      setConsumptionOfficial(v?.consumption_official != null ? String(v.consumption_official) : '');
      setIsDefault(v?.is_default ?? false);
      setInitialized(true);
    }
  }, [vehicleData, initialized]);

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
      bien_so: bien_so.trim() || null,
      make: make.trim() || null,
      model: model.trim() || null,
      nam: nam.trim() ? parseInt(nam.trim(), 10) : null,
      odo_ban_dau: odo_ban_dau.trim() ? parseInt(odo_ban_dau.trim(), 10) : null,
      tank_capacity_l: tank_capacity_l.trim() ? parseFloat(tank_capacity_l.trim()) : null,
      consumption_official: consumption_official.trim() ? parseFloat(consumption_official.trim()) : null,
    };

    try {
      await updateVehicle.mutateAsync({ id: vehicleId, data: payload });
      navigation.goBack();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        'Có lỗi xảy ra. Vui lòng thử lại.';
      setApiError(msg);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Xoá xe',
      'Bạn có chắc muốn xoá xe này? Hành động này không thể hoàn tác.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicle.mutateAsync(vehicleId);
              navigation.goBack();
            } catch (err: any) {
              const msg =
                err?.response?.data?.message ??
                err?.response?.data?.error ??
                'Không thể xoá xe. Vui lòng thử lại.';
              Alert.alert('Lỗi', msg);
            }
          },
        },
      ],
    );
  };

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message="Không tải được thông tin xe" onRetry={refetch} />;

  const isBusy = updateVehicle.isPending || deleteVehicle.isPending;

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
          disabled={isBusy}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            marginBottom: 12,
            opacity: isBusy ? 0.7 : 1,
          }}>
          {updateVehicle.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Lưu thay đổi</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleDelete}
          disabled={isBusy}
          style={{
            backgroundColor: 'transparent',
            borderRadius: 12,
            paddingVertical: 16,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.error,
            opacity: isBusy ? 0.5 : 1,
          }}>
          {deleteVehicle.isPending ? (
            <ActivityIndicator color={colors.error} />
          ) : (
            <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700' }}>Xoá xe</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
