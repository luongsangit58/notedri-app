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
import { useSendTransferRequest } from '../../hooks/useVehicleTransfer';
import { useAuthStore } from '../../store/authStore';
import VehicleMoreFields, { VehicleExtra, EMPTY_VEHICLE_EXTRA, extraFromVehicle, extraToPayload } from '../../components/VehicleMoreFields';
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
  const sendTransferRequest = useSendTransferRequest();
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  const deleteVehicle = useDeleteVehicle();
  // Loại nhiên liệu: danh sách TĨNH khớp web (không lấy từ bảng giá xăng).
  const FUEL_OPTIONS: { value: string; label: string }[] = [
    { value: 'Xăng',   label: t('vehicles.fuel_petrol') },
    { value: 'Dầu',    label: t('vehicles.fuel_diesel') },
    { value: 'Điện',   label: t('vehicles.fuel_electric') },
    { value: 'Hybrid', label: t('vehicles.fuel_hybrid') },
    { value: 'Khác',   label: t('vehicles.fuel_other') },
  ];

  const [ten, setTen] = useState('');
  const [bien_so, setBienSo] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [nam, setNam] = useState('');
  const [fuel_type, setFuelType] = useState('Xăng');
  const [odo_ban_dau, setOdoBanDau] = useState('');
  const [tank_capacity_l, setTankCapacity] = useState('');
  const [consumption_official, setConsumptionOfficial] = useState('');
  const [is_default, setIsDefault] = useState(false);
  const [extra, setExtra] = useState<VehicleExtra>(EMPTY_VEHICLE_EXTRA);
  const [showMore, setShowMore] = useState(false);
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
      setFuelType(v?.fuel_type ?? 'Xăng');
      setOdoBanDau(v?.odo_ban_dau != null ? String(v.odo_ban_dau) : '');
      setTankCapacity(v?.tank_capacity_l != null ? String(v.tank_capacity_l) : '');
      setConsumptionOfficial(v?.consumption_official != null ? String(v.consumption_official) : '');
      setIsDefault(v?.is_default ?? false);
      setExtra(extraFromVehicle(v));
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
    // Validate năm sản xuất chỉ khi bấm lưu (không chặn lúc gõ), tránh hiện
    // message tiếng Anh thô của backend ("The nam field must not be greater
    // than 2026") - tester báo lỗi này.
    const currentYear = new Date().getFullYear();
    if (nam.trim()) {
      const namNum = parseInt(nam.trim(), 10);
      if (!Number.isFinite(namNum) || namNum < 1980 || namNum > currentYear) {
        Alert.alert(t('vehicles.missing_info_title'), t('vehicles.year_invalid_msg', { max: currentYear }));
        return;
      }
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
      ...extraToPayload(extra),
    };

    if (removeExistingPhoto && !photo) {
      payload.anh_xoa = true;
    }

    try {
      const result = await updateVehicle.mutateAsync({ id: vehicleId, data: payload, photo: photo ?? undefined });
      // VIN #29/#30: cảnh báo KHÔNG CHẶN khi backend phát hiện VIN trùng xe khác -
      // xem AddVehicleScreen. Premium: mời gửi yêu cầu xem lịch sử bảo dưỡng (#30).
      if (result?.meta?.vin_duplicate) {
        if (isPremium) {
          Alert.alert(t('vehicles.vin_duplicate_title'), t('vehicles.vin_duplicate_send_request'), [
            { text: t('common.cancel'), style: 'cancel', onPress: () => navigation.goBack() },
            {
              text: t('vehicles.vin_duplicate_send_request_btn'),
              onPress: () => {
                sendTransferRequest.mutate(vehicleId, {
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
      {/* Rà soát 20/7 (car head-unit landscape): cap 720 khớp AddVehicleScreen
          (form dày chữ, cùng ý tưởng contentWide của HomeScreen nhưng hẹp hơn). */}
      <ScrollView
        contentContainerStyle={[{ padding: 16, paddingBottom: 40 }, { width: '100%', maxWidth: 720, alignSelf: 'center' }]}
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

        {/* Thêm thông tin xe (tuỳ chọn) - khớp web */}
        <TouchableOpacity
          onPress={() => setShowMore(v => !v)}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: colors.surface, borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 13, marginTop: 4, marginBottom: 12,
            borderWidth: 1, borderColor: showMore ? colors.primary : colors.border,
          }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primary + '1f', alignItems: 'center', justifyContent: 'center' }}>
            <FontAwesome5 name="sliders-h" size={13} color={colors.primary} solid />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{t('add_vehicle.more_info_title')}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{t('add_vehicle.more_info_subtitle')}</Text>
          </View>
          <FontAwesome5 name={showMore ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textSecondary} />
        </TouchableOpacity>
        {showMore && <VehicleMoreFields value={extra} onChange={(patch) => setExtra(e => ({ ...e, ...patch }))} />}

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
              // Rà soát 17/7 (user báo ảnh xe bị cắt cụt vì khung quá dẹt): height cố định
              // 120px trên toàn chiều rộng màn hình tạo khung rất dẹt (rộng gấp ~2.7 lần cao),
              // buộc resizeMode="cover" cắt bớt 2 bên ảnh thật (thường không dẹt bằng) để lấp
              // đầy khung, mất phần đầu/đuôi xe. Khớp đúng aspectRatio 4:3 với `aspect: [4, 3]`
              // ở pickPhoto() bên dưới (ImagePicker.launchImageLibraryAsync) để ảnh vừa crop ra
              // không bị cắt thêm lần nữa khi hiển thị lại trong khung preview.
              aspectRatio: 4 / 3,
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
