import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../utils/colors';

interface HealthScore {
  total: number;
  band: string;
}

interface Props {
  vehicle: any;
  onPress?: () => void;
  score?: HealthScore | null;
}

const BAND_CONFIG: Record<string, { label: string; color: string }> = {
  excellent: { label: 'Xuất sắc', color: '#10B981' },
  good:      { label: 'Tốt',      color: '#10B981' },
  fair:      { label: 'Khá',      color: '#F59E0B' },
  poor:      { label: 'Kém',      color: '#F44336' },
};

export default function VehicleCard({ vehicle, onPress, score }: Props) {
  const name = vehicle.ten ?? vehicle.name;
  const bandCfg = score?.band ? BAND_CONFIG[score.band] : null;

  // Row 2: make · model · year — only non-null parts
  const subtitleParts: string[] = [];
  if (vehicle.make)  subtitleParts.push(vehicle.make);
  if (vehicle.model) subtitleParts.push(vehicle.model);
  if (vehicle.nam)   subtitleParts.push(String(vehicle.nam));
  const subtitle = subtitleParts.join(' · ');

  // Row 3: fuel type, tank, ODO
  const row3Parts: string[] = [];
  if (vehicle.fuel_type)        row3Parts.push(vehicle.fuel_type);
  if (vehicle.tank_capacity_l)  row3Parts.push(`${vehicle.tank_capacity_l}L`);
  if (vehicle.odo_hien_tai != null) {
    row3Parts.push(`ODO: ${Number(vehicle.odo_hien_tai).toLocaleString('vi-VN')}km`);
  }
  const row3 = row3Parts.join(' · ');

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

      {/* Row 1: name + default star + health badge */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>
          {name}
        </Text>
        {vehicle.is_default && (
          <FontAwesome5 name="star" size={14} color="#F59E0B" solid />
        )}
        {bandCfg && (
          <View style={{
            backgroundColor: bandCfg.color + '22',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}>
            <Text style={{ color: bandCfg.color, fontSize: 11, fontWeight: '700' }}>
              {score!.total} · {bandCfg.label}
            </Text>
          </View>
        )}
      </View>

      {/* Row 2: make · model · year */}
      {subtitle ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}

      {/* Row 3: fuel · tank · ODO */}
      {row3 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
          {row3}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}
