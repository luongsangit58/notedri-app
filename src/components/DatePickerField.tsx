import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
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

function toStr(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
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

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseDateStr(str: string): [number, number, number] {
  const parts = datePart(str).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return [y, m, d];
  }
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
}

const MONTH_KEYS = [
  'date_picker.month_1','date_picker.month_2','date_picker.month_3','date_picker.month_4',
  'date_picker.month_5','date_picker.month_6','date_picker.month_7','date_picker.month_8',
  'date_picker.month_9','date_picker.month_10','date_picker.month_11','date_picker.month_12',
];

const ITEM_H = 44;
const VISIBLE = 5;

function Drum({ items, value, onChange, width }: {
  items: (string | number)[];
  value: number; // index in items
  onChange: (idx: number) => void;
  width?: number;
}) {
  const colors = useColors();
  const ref = React.useRef<ScrollView>(null);
  const lockedRef = React.useRef(false);

  React.useEffect(() => {
    if (!lockedRef.current) {
      ref.current?.scrollTo({ y: value * ITEM_H, animated: false });
    }
  }, [value]);

  return (
    <View style={{ width: width ?? 72, height: ITEM_H * VISIBLE, overflow: 'hidden' }}>
      {/* highlight selected row */}
      <View pointerEvents="none" style={{
        position: 'absolute',
        top: ITEM_H * 2,
        left: 0, right: 0,
        height: ITEM_H,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.primary,
        zIndex: 1,
      }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          lockedRef.current = false;
          onChange(clamp(idx, 0, items.length - 1));
        }}
        onScrollBeginDrag={() => { lockedRef.current = true; }}
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
      >
        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => {
              onChange(i);
              ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
            }}
            style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{
              fontSize: i === value ? 18 : 14,
              fontWeight: i === value ? '700' : '400',
              color: i === value ? colors.text : colors.textSecondary,
            }}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 21 }, (_, i) => currentYear - 20 + i);
const DAYS_MAX = Array.from({ length: 31 }, (_, i) => i + 1);

export default function DatePickerField({ label, value, onChange, style }: Props) {
  const colors = useColors();
  const t = useT();
  const MONTHS = MONTH_KEYS.map((k) => t(k as any));
  const [show, setShow] = useState(false);

  const [initY, initM, initD] = parseDateStr(value);
  const [year, setYear] = useState(initY);
  const [month, setMonth] = useState(initM);
  const [day, setDay] = useState(initD);

  const openPicker = () => {
    const [y, m, d] = parseDateStr(value);
    setYear(y); setMonth(m); setDay(d);
    setShow(true);
  };

  const maxDay = daysInMonth(year, month);
  const validDays = Array.from({ length: maxDay }, (_, i) => i + 1);
  const safeDay = clamp(day, 1, maxDay);

  const handleConfirm = () => {
    onChange(toStr(year, month, safeDay));
    setShow(false);
  };

  const dayIdx = safeDay - 1;
  const monthIdx = month - 1;
  const yearIdx = YEARS.indexOf(year) === -1 ? YEARS.length - 1 : YEARS.indexOf(year);

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
          {/* Header */}
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

          {/* Drums */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 8, gap: 4 }}>
            <View style={{ alignItems: 'center' }}>
              <Drum
                items={validDays}
                value={dayIdx}
                onChange={(i) => setDay(i + 1)}
                width={60}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{t('date_picker.day')}</Text>
            </View>

            <View style={{ alignItems: 'center' }}>
              <Drum
                items={MONTHS}
                value={monthIdx}
                onChange={(i) => setMonth(i + 1)}
                width={72}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{t('date_picker.month')}</Text>
            </View>

            <View style={{ alignItems: 'center' }}>
              <Drum
                items={YEARS}
                value={yearIdx}
                onChange={(i) => setYear(YEARS[i])}
                width={72}
              />
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4 }}>{t('date_picker.year')}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
