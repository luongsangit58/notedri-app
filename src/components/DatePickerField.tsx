import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';

interface Props {
  label?: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  style?: object;
}

function toDate(str: string): Date {
  const parts = str.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
  }
  return new Date();
}

function toStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function displayDate(str: string): string {
  const parts = str.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return str;
}

export default function DatePickerField({ label, value, onChange, style }: Props) {
  const colors = useColors();
  const [show, setShow] = useState(false);

  const handleChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false);
    if (selected) onChange(toStr(selected));
  };

  const picker = (
    <DateTimePicker
      value={toDate(value)}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={handleChange}
      maximumDate={new Date()}
    />
  );

  return (
    <View style={style}>
      {label ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 4 }}>
          {label}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={() => setShow(true)}
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

      {/* Android: show inline picker dialog */}
      {Platform.OS === 'android' && show && picker}

      {/* iOS: show in modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide">
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' }}>
            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, paddingBottom: 0 }}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>Xong</Text>
                </TouchableOpacity>
              </View>
              {picker}
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
