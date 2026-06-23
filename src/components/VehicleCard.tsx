import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../utils/colors';

interface Props {
  vehicle: any;
  onPress?: () => void;
}

export default function VehicleCard({ vehicle, onPress }: Props) {
  const name = vehicle.ten ?? vehicle.name;
  const plate = vehicle.bien_so ?? vehicle.license_plate;
  const odo = vehicle.odo_hien_tai ?? vehicle.current_odometer;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: vehicle.is_default ? 1.5 : 0,
        borderColor: colors.primary,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{name}</Text>
        {vehicle.is_default && (
          <View style={{ backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Mặc định</Text>
          </View>
        )}
      </View>
      {plate ? <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{plate}</Text> : null}
      {odo != null && (
        <Text style={{ color: colors.primary, marginTop: 6, fontWeight: '600', fontSize: 13 }}>
          ODO: {Number(odo).toLocaleString('vi-VN')} km
        </Text>
      )}
    </TouchableOpacity>
  );
}
