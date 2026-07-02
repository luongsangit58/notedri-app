import React from 'react';
import { View, Text, TextInput } from 'react-native';
import DatePickerField from './DatePickerField';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

// Các trường hồ sơ xe TUỲ CHỌN (khớp web _form): màu, VIN, số máy, đại lý, ngày/giá mua, ghi chú.
export type VehicleExtra = {
  mau: string;
  mau_noi_that: string;
  vin: string;
  engine_no: string;
  dealer: string;
  ngay_mua: string;
  gia_mua: string;
  notes: string;
};

export const EMPTY_VEHICLE_EXTRA: VehicleExtra = {
  mau: '', mau_noi_that: '', vin: '', engine_no: '', dealer: '', ngay_mua: '', gia_mua: '', notes: '',
};

/** Nạp từ model xe (API) -> state form. */
export function extraFromVehicle(v: any): VehicleExtra {
  return {
    mau: v?.mau ?? '',
    mau_noi_that: v?.mau_noi_that ?? '',
    vin: v?.vin ?? '',
    engine_no: v?.engine_no ?? '',
    dealer: v?.dealer ?? '',
    ngay_mua: v?.ngay_mua ? String(v.ngay_mua).slice(0, 10) : '',
    gia_mua: v?.gia_mua != null ? String(v.gia_mua) : '',
    notes: v?.notes ?? '',
  };
}

/** State form -> payload gửi API (chuỗi rỗng -> null, giá bỏ dấu chấm -> số). */
export function extraToPayload(e: VehicleExtra): Record<string, any> {
  const digits = (e.gia_mua || '').replace(/\D/g, '');
  return {
    mau: e.mau.trim() || null,
    mau_noi_that: e.mau_noi_that.trim() || null,
    vin: e.vin.trim() || null,
    engine_no: e.engine_no.trim() || null,
    dealer: e.dealer.trim() || null,
    ngay_mua: e.ngay_mua.trim() || null,
    gia_mua: digits ? parseInt(digits, 10) : null,
    notes: e.notes.trim() || null,
  };
}

function formatMoney(v: string): string {
  const d = v.replace(/\D/g, '');
  return d ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}

export default function VehicleMoreFields({
  value, onChange,
}: {
  value: VehicleExtra;
  onChange: (patch: Partial<VehicleExtra>) => void;
}) {
  const colors = useColors();
  const t = useT();

  const inputStyle = {
    backgroundColor: colors.surface, color: colors.text, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  };
  const labelStyle = { color: colors.textSecondary, fontSize: 12, marginBottom: 4, marginTop: 4 };

  return (
    <View>
      <Text style={labelStyle}>{t('vehicles.color_label')}</Text>
      <TextInput style={inputStyle} value={value.mau} onChangeText={(v) => onChange({ mau: v })}
        placeholder={t('vehicles.color_placeholder')} placeholderTextColor={colors.textSecondary} />

      <Text style={labelStyle}>{t('vehicles.interior_color_label')}</Text>
      <TextInput style={inputStyle} value={value.mau_noi_that} onChangeText={(v) => onChange({ mau_noi_that: v })}
        placeholder={t('vehicles.color_placeholder')} placeholderTextColor={colors.textSecondary} />

      <Text style={labelStyle}>{t('add_vehicle.vin_label')}</Text>
      <TextInput style={inputStyle} value={value.vin} onChangeText={(v) => onChange({ vin: v })}
        placeholder={t('add_vehicle.vin_placeholder')} placeholderTextColor={colors.textSecondary} autoCapitalize="characters" />

      <Text style={labelStyle}>{t('vehicles.engine_no_label')}</Text>
      <TextInput style={inputStyle} value={value.engine_no} onChangeText={(v) => onChange({ engine_no: v })}
        placeholder={t('vehicles.engine_no_label')} placeholderTextColor={colors.textSecondary} autoCapitalize="characters" />

      <Text style={labelStyle}>{t('vehicles.dealer_label')}</Text>
      <TextInput style={inputStyle} value={value.dealer} onChangeText={(v) => onChange({ dealer: v })}
        placeholder={t('vehicles.dealer_placeholder')} placeholderTextColor={colors.textSecondary} />

      <Text style={labelStyle}>{t('add_vehicle.purchase_date_label')}</Text>
      <DatePickerField value={value.ngay_mua} onChange={(d) => onChange({ ngay_mua: d })} style={{ marginBottom: 12 }} />

      <Text style={labelStyle}>{t('add_vehicle.purchase_price_label')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 12, paddingRight: 14 }}>
        <TextInput
          style={{ flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 }}
          value={value.gia_mua} onChangeText={(v) => onChange({ gia_mua: formatMoney(v) })}
          placeholder={t('add_vehicle.purchase_price_placeholder')} placeholderTextColor={colors.textSecondary}
          keyboardType="numeric" />
        <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: '700' }}>đ</Text>
      </View>

      <Text style={labelStyle}>{t('common.note')}</Text>
      <TextInput style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]} value={value.notes} onChangeText={(v) => onChange({ notes: v })}
        placeholder={t('add_vehicle.notes_placeholder')} placeholderTextColor={colors.textSecondary} multiline />
    </View>
  );
}
