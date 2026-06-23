import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../utils/colors';
import dayjs from 'dayjs';

const typeIcon: Record<string, string> = {
  refuel: '⛽',
  service: '🔧',
  odometer: '📍',
};

export default function TimelineItem({ item }: { item: any }) {
  return (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'flex-start',
    }}>
      <Text style={{ fontSize: 22, marginRight: 12, marginTop: 2 }}>{typeIcon[item.type] ?? '📌'}</Text>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Text style={{ color: colors.text, fontWeight: '600', flex: 1, marginRight: 8 }}>{item.title ?? item.type}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{dayjs(item.date).format('DD/MM/YY')}</Text>
        </View>
        {item.detail ? (
          <Text style={{ color: colors.textSecondary, marginTop: 3, fontSize: 13 }}>{item.detail}</Text>
        ) : null}
        {item.odometer != null && (
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
            ODO: {Number(item.odometer).toLocaleString('vi-VN')} km
          </Text>
        )}
        {item.cost != null && item.cost > 0 && (
          <Text style={{ color: colors.primary, marginTop: 4, fontWeight: '700', fontSize: 14 }}>
            {Number(item.cost).toLocaleString('vi-VN')}đ
          </Text>
        )}
      </View>
    </View>
  );
}
