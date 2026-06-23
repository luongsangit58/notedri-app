import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../utils/colors';
import dayjs from 'dayjs';

interface TimelineEvent {
  id: number;
  type: 'refuel' | 'service' | 'odometer';
  date: string;
  description: string;
  amount?: number;
  vehicle_name?: string;
}

interface Props {
  item: TimelineEvent;
}

const typeIcon: Record<string, string> = {
  refuel: '⛽',
  service: '🔧',
  odometer: '📍',
};

const typeLabel: Record<string, string> = {
  refuel: 'Đổ xăng',
  service: 'Bảo dưỡng',
  odometer: 'Cập nhật ODO',
};

export default function TimelineItem({ item }: Props) {
  return (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'flex-start',
    }}>
      <Text style={{ fontSize: 24, marginRight: 12 }}>{typeIcon[item.type] ?? '📌'}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{typeLabel[item.type] ?? item.type}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(item.date).format('DD/MM/YYYY')}</Text>
        </View>
        <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{item.description}</Text>
        {item.amount != null && (
          <Text style={{ color: colors.primary, marginTop: 4, fontWeight: '600' }}>
            {item.amount.toLocaleString('vi-VN')}đ
          </Text>
        )}
      </View>
    </View>
  );
}
