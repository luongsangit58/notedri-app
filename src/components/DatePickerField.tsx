import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useColors } from '../utils/theme';
import { useT } from '../i18n';

interface Props {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  style?: object;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// Chuẩn hoá về đúng phần ngày "YYYY-MM-DD": backend cast kiểu `date` serialize
// ra ISO đầy đủ ("2026-07-14T00:00:00.000000Z") - nếu không cắt phần giờ thì
// displayDate tách theo '-' sẽ hiện "14T00:00:00.000000Z/07/2026" (lỗi Sang báo).
function datePart(str: string): string {
  return (str || '').split('T')[0];
}

function displayDate(str: string): string {
  const parts = datePart(str).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return str;
}

function toDate(str: string): Date {
  const parts = datePart(str).split('-').map((p) => parseInt(p, 10));
  if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return new Date();
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function DatePickerField({ label, value, onChange, style }: Props) {
  const colors = useColors();
  const t = useT();
  const [show, setShow] = useState(false);
  const [draft, setDraft] = useState(() => toDate(value));

  const openPicker = () => {
    setDraft(toDate(value));
    setShow(true);
  };

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type !== 'dismissed' && selected) onChange(toStr(selected));
      return;
    }
    if (selected) setDraft(selected);
  };

  const handleConfirm = () => {
    onChange(toStr(draft));
    setShow(false);
  };

  return (
    <View style={style}>
      {label ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>
          {label}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={openPicker}
        style={{
          backgroundColor: colors.surface,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}>
        <Text style={{ color: colors.text, fontSize: 16 }}>
          {displayDate(value)}
        </Text>
        <FontAwesome5 name="calendar-alt" size={15} color={colors.primary} />
      </TouchableOpacity>

      {show && Platform.OS === 'android' ? (
        <DateTimePicker value={draft} mode="date" display="default" onChange={handleChange} />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
            activeOpacity={1}
            onPress={() => setShow(false)}
          />
          <View style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: 32,
          }}>
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
              borderBottomWidth: 1, borderColor: colors.border,
            }}>
              <TouchableOpacity onPress={() => setShow(false)}>
                <Text style={{ color: colors.textSecondary, fontSize: 15 }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{t('date_picker.title')}</Text>
              <TouchableOpacity onPress={handleConfirm}>
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '700' }}>{t('date_picker.done')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker value={draft} mode="date" display="inline" onChange={handleChange} />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
