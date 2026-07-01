import React from 'react';
import { TextInput, TextInputProps } from 'react-native';

// Hiển thị tiền có dấu chấm phân cách ("100.000") trong khi GIÁ TRỊ lưu là số thô
// ("100000"). Parent giữ chuỗi số thô; submit chỉ cần parseInt/parseFloat.

export function formatThousands(raw: string | number | null | undefined): string {
  if (raw == null) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Chuẩn hoá giá trị tiền khi nạp từ backend (vd "100000.00" -> "100000")
export function toMoneyRaw(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? String(n) : '';
}

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;                       // chuỗi số thô, vd "100000"
  onChangeText: (raw: string) => void; // trả lại chuỗi số thô
}

export default function MoneyInput({ value, onChangeText, ...rest }: Props) {
  return (
    <TextInput
      {...rest}
      value={formatThousands(value)}
      onChangeText={(t) => onChangeText(t.replace(/\D/g, ''))}
      keyboardType="numeric"
    />
  );
}
