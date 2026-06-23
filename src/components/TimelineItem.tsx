import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../utils/colors';
import dayjs from 'dayjs';

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'refuel':
      return <FontAwesome5 name="gas-pump" size={18} color="#F59E0B" solid />;
    case 'service':
      return <FontAwesome5 name="wrench" size={18} color={colors.textSecondary} solid />;
    case 'odometer':
      return <FontAwesome5 name="road" size={18} color={colors.textSecondary} solid />;
    default:
      return <FontAwesome5 name="circle" size={18} color={colors.textSecondary} solid />;
  }
}

export default function TimelineItem({ item, onPress }: { item: any; onPress?: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}>
      <View style={{ width: 28, alignItems: 'center', marginRight: 12, marginTop: 2 }}>
        <TypeIcon type={item.type} />
      </View>
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
    </TouchableOpacity>
  );
}
