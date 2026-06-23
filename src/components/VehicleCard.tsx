import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { colors } from '../utils/colors';

interface Vehicle {
  id: number;
  name: string;
  license_plate: string;
  current_odometer?: number;
  is_default?: boolean;
}

interface Props {
  vehicle: Vehicle;
  onPress?: () => void;
}

export default function VehicleCard({ vehicle, onPress }: Props) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: vehicle.is_default ? 1 : 0,
        borderColor: colors.primary,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{vehicle.name}</Text>
        {vehicle.is_default && (
          <View style={{ backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Mặc định</Text>
          </View>
        )}
      </View>
      <Text style={{ color: colors.textSecondary, marginTop: 4 }}>{vehicle.license_plate}</Text>
      {vehicle.current_odometer != null && (
        <Text style={{ color: colors.textSecondary, marginTop: 2 }}>
          ODO: {vehicle.current_odometer.toLocaleString('vi-VN')} km
        </Text>
      )}
    </TouchableOpacity>
  );
}
