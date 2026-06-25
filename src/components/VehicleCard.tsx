import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';

interface HealthScore {
  total: number;
  band: string;
}

interface Props {
  vehicle: any;
  onPress?: () => void;
  score?: HealthScore | null;
}

const BAND_LABEL: Record<string, string> = {
  excellent: 'Xuất sắc',
  good:      'Tốt',
  fair:      'Khá',
  poor:      'Kém',
};

export default function VehicleCard({ vehicle, onPress, score }: Props) {
  const colors = useColors();
  const name = vehicle.ten ?? vehicle.name;

  const bandColor = (band: string) => {
    if (band === 'excellent' || band === 'good') return colors.success;
    if (band === 'fair') return colors.primary;
    return colors.error;
  };

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
          <FontAwesome5 name="star" size={14} color={colors.primary} solid />
        )}
        {score?.band && (
          <View style={{
            backgroundColor: bandColor(score.band) + '22',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}>
            <Text style={{ color: bandColor(score.band), fontSize: 11, fontWeight: '700' }}>
              {score.total} · {BAND_LABEL[score.band] ?? score.band}
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
