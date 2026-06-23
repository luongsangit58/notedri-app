import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDeleteRefuel } from '../../hooks/useRefuels';
import { refuelsApi } from '../../api/refuels';
import client from '../../api/client';
import { colors } from '../../utils/colors';

const FUEL_TYPES = ['E5 RON 95-V', 'RON 95-III', 'E5 RON 92', 'Dầu DO 0,05S-V', 'Dầu DO 0,001S'];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>
      {children}
    </Text>
  );
}

const inputStyle = {
  backgroundColor: colors.surface,
  color: colors.text,
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 16,
};

export default function EditRefuelScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { refuelId } = route.params as { refuelId: number };

  const deleteRefuel = useDeleteRefuel();

  const [loading, setLoading] = useState(true);
  const [original, setOriginal] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  // Form state
  const [fuelType, setFuelType] = useState(FUEL_TYPES[0]);
  const [tongTien, setTongTien] = useState('');
  const [soLit, setSoLit] = useState('');
  const [giaLit, setGiaLit] = useState('');
  const [odometer, setOdometer] = useState('');
  const [ngay, setNgay] = useState('');
  const [cayXang, setCayXang] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [isFullTank, setIsFullTank] = useState(true);

  useEffect(() => {
    client
      .get(`/refuels/${refuelId}`)
      .then((r) => {
        const data = r.data?.data ?? r.data;
        setOriginal(data);
        setFuelType(data?.fuel_type ?? FUEL_TYPES[0]);
        setTongTien(data?.tong_tien != null ? String(data.tong_tien) : '');
        setSoLit(data?.so_lit != null ? String(data.so_lit) : '');
        setGiaLit(data?.gia_lit != null ? String(data.gia_lit) : '');
        setOdometer(data?.odometer != null ? String(data.odometer) : '');
        setNgay(data?.ngay ?? '');
        setCayXang(data?.cay_xang ?? '');
        setGhiChu(data?.ghi_chu ?? '');
        setIsFullTank(data?.is_full_tank ?? true);
        setLoading(false);
      })
      .catch(() => navigation.goBack());
  }, []);

  const handleUpdate = async () => {
    if (!tongTien && !soLit) {
      Alert.alert('Lỗi', 'Nhập ít nhất tổng tiền hoặc số lít');
      return;
    }
    setUpdating(true);
    try {
      await refuelsApi.update(refuelId, {
        fuel_type: fuelType,
        tong_tien: tongTien ? parseFloat(tongTien) : null,
        so_lit: soLit ? parseFloat(soLit) : null,
        gia_lit: giaLit ? parseFloat(giaLit) : null,
        odometer: odometer ? parseInt(odometer, 10) : null,
        ngay,
        cay_xang: cayXang || null,
        ghi_chu: ghiChu || null,
        is_full_tank: isFullTank,
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Không cập nhật được';
      const errs = err?.response?.data?.errors;
      const detail = errs ? Object.values(errs).flat().join('\n') : null;
      Alert.alert('Lỗi', detail ?? msg);
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Xoá lần đổ xăng',
      'Bạn có chắc muốn xoá lần đổ xăng này? Hành động này không thể hoàn tác.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá',
          style: 'destructive',
          onPress: () => {
            deleteRefuel.mutate(refuelId, {
              onSuccess: () => navigation.goBack(),
              onError: (e: any) =>
                Alert.alert('Lỗi', e?.response?.data?.message ?? 'Không xoá được'),
            });
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isBusy = updating || deleteRefuel.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Loại xăng */}
          <FieldLabel>Loại nhiên liệu</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            {FUEL_TYPES.map((ft) => (
              <TouchableOpacity
                key={ft}
                onPress={() => setFuelType(ft)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  marginRight: 8,
                  backgroundColor: fuelType === ft ? colors.primary : colors.surface,
                }}>
                <Text style={{ color: fuelType === ft ? '#fff' : colors.text, fontSize: 13 }}>
                  {ft}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Tổng tiền */}
          <View style={{ marginBottom: 4 }}>
            <FieldLabel>Tổng tiền (đ) *</FieldLabel>
            <TextInput
              value={tongTien}
              onChangeText={setTongTien}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              style={[inputStyle, { fontSize: 18, fontWeight: '700' }]}
            />
          </View>

          {/* Số lít + Giá/lít */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>Số lít</FieldLabel>
              <TextInput
                value={soLit}
                onChangeText={setSoLit}
                placeholder="0.0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel>Giá/lít</FieldLabel>
              <TextInput
                value={giaLit}
                onChangeText={setGiaLit}
                placeholder="0"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>
          </View>

          <FieldLabel>ODO (km)</FieldLabel>
          <TextInput
            value={odometer}
            onChangeText={setOdometer}
            placeholder="Số km hiện tại"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            style={[inputStyle, { marginBottom: 4 }]}
          />

          <FieldLabel>Ngày</FieldLabel>
          <TextInput
            value={ngay}
            onChangeText={setNgay}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textSecondary}
            style={[inputStyle, { marginBottom: 4 }]}
          />

          <FieldLabel>Cây xăng</FieldLabel>
          <TextInput
            value={cayXang}
            onChangeText={setCayXang}
            placeholder="Petrolimex, Shell..."
            placeholderTextColor={colors.textSecondary}
            style={[inputStyle, { marginBottom: 4 }]}
          />

          <FieldLabel>Ghi chú</FieldLabel>
          <TextInput
            value={ghiChu}
            onChangeText={setGhiChu}
            placeholder="Ghi chú thêm..."
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[inputStyle, { minHeight: 72, textAlignVertical: 'top', marginBottom: 4 }]}
          />

          {/* Full tank toggle */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
          }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: '600' }}>Đổ đầy bình</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Tính L/100km chính xác hơn
              </Text>
            </View>
            <Switch
              value={isFullTank}
              onValueChange={setIsFullTank}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          {/* Cập nhật button */}
          <TouchableOpacity
            onPress={handleUpdate}
            disabled={isBusy}
            style={{
              backgroundColor: colors.primary,
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginBottom: 12,
              opacity: isBusy ? 0.7 : 1,
            }}>
            {updating
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Cập nhật</Text>}
          </TouchableOpacity>

          {/* Xoá button */}
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
            {deleteRefuel.isPending
              ? <ActivityIndicator color={colors.error} />
              : <Text style={{ color: colors.error, fontSize: 16, fontWeight: '700' }}>Xoá lần đổ xăng</Text>}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
