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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useVehicle, useUpdateVehicle, useDeleteVehicle } from '../../hooks/useVehicles';
import { useFuelTypes } from '../../hooks/useFuelTypes';
import LoadingView from '../../components/LoadingView';
import ErrorView from '../../components/ErrorView';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import type { VehiclePhoto } from '../../api/vehicles';

export default function EditVehicleScreen() {
  const colors = useColors();
  const t = useT();
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
  const [photo, setPhoto] = useState<VehiclePhoto | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);

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
      setExistingPhotoUrl(v?.anh_url ?? null);
      setInitialized(true);
    }
  }, [vehicleData, initialized]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), t('add_vehicle.photo_permission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setPhoto({ uri: asset.uri, type: asset.mimeType ?? 'image/jpeg', name: 'vehicle.jpg' });
      setRemoveExistingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    if (!ten.trim()) {
      Alert.alert(t('vehicles.missing_info_title'), t('vehicles.name_required_msg'));
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

    if (removeExistingPhoto && !photo) {
      payload.anh_xoa = true;
    }

    try {
      await updateVehicle.mutateAsync({ id: vehicleId, data: payload, photo: photo ?? undefined });
      navigation.goBack();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        t('vehicles.error_generic');
      setApiError(msg);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('vehicles.delete_confirm_title'),
      t('vehicles.delete_confirm_message'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('vehicles.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVehicle.mutateAsync(vehicleId);
              navigation.goBack();
            } catch (err: any) {
              const msg =
                err?.response?.data?.message ??
                err?.response?.data?.error ??
                t('vehicles.cannot_delete');
              Alert.alert(t('common.error'), msg);
            }
          },
        },
      ],
    );
  };

  if (isLoading) return <LoadingView />;
  if (isError) return <ErrorView message={t('common.error_load')} onRetry={refetch} />;

  const isBusy = updateVehicle.isPending || deleteVehicle.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <AppBgPattern />
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

        <Text style={labelStyle}>{t('vehicles.name_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.name_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={ten}
          onChangeText={setTen}
          returnKeyType="next"
        />

        <Text style={labelStyle}>{t('vehicles.plate_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.plate_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={bien_so}
          onChangeText={setBienSo}
          autoCapitalize="characters"
          returnKeyType="next"
        />

        <Text style={labelStyle}>{t('vehicles.make_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.make_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={make}
          onChangeText={setMake}
          returnKeyType="next"
        />

        <Text style={labelStyle}>{t('vehicles.model_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.model_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={model}
          onChangeText={setModel}
          returnKeyType="next"
        />

        <Text style={labelStyle}>{t('vehicles.year_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.year_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={nam}
          onChangeText={setNam}
          keyboardType="numeric"
          returnKeyType="next"
        />

        <Text style={labelStyle}>{t('vehicles.fuel_type_label')}</Text>
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
                    color: selected ? colors.primaryText : colors.textSecondary,
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

        <Text style={labelStyle}>{t('vehicles.odo_initial_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('vehicles.odo_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={odo_ban_dau}
          onChangeText={setOdoBanDau}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <Text style={labelStyle}>{t('vehicles.tank_capacity_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('add_vehicle.tank_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={tank_capacity_l}
          onChangeText={setTankCapacity}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <Text style={labelStyle}>{t('vehicles.consumption_official_label')}</Text>
        <TextInput
          style={inputStyle}
          placeholder={t('add_vehicle.consumption_placeholder')}
          placeholderTextColor={colors.textSecondary}
          value={consumption_official}
          onChangeText={setConsumptionOfficial}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <View style={{ marginBottom: 16 }}>
          <Text style={labelStyle}>{t('add_vehicle.photo_label')}</Text>
          <TouchableOpacity
            onPress={pickPhoto}
            style={{
              backgroundColor: colors.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              borderStyle: 'dashed',
              height: 120,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : existingPhotoUrl && !removeExistingPhoto ? (
              <Image source={{ uri: existingPhotoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View style={{ alignItems: 'center', gap: 6 }}>
                <FontAwesome5 name="camera" size={24} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t('add_vehicle.pick_photo')}</Text>
              </View>
            )}
          </TouchableOpacity>
          {(photo || (existingPhotoUrl && !removeExistingPhoto)) && (
            <TouchableOpacity
              onPress={() => {
                setPhoto(null);
                if (existingPhotoUrl) setRemoveExistingPhoto(true);
              }}
              style={{ marginTop: 6, alignSelf: 'flex-end' }}>
              <Text style={{ color: colors.error, fontSize: 12 }}>{t('add_vehicle.remove_photo')}</Text>
            </TouchableOpacity>
          )}
        </View>

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
          <Text style={{ color: colors.text, fontSize: 15 }}>{t('vehicles.set_default')}</Text>
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
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={{ color: colors.primaryText, fontSize: 16, fontWeight: '700' }}>{t('vehicles.save_changes')}</Text>
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
            <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700' }}>{t('vehicles.delete')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
