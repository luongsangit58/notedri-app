import React from 'react';
import { View, Text, TouchableOpacity, ImageBackground } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../utils/theme';
import { vehicleIcon } from '../utils/vehicleIcon';
import { fuelTypeMeta } from '../utils/fuelType';
import { useT } from '../i18n';

// band có thể là string (key) hoặc object { key, label, color } từ API
interface BandObj { key: string; label: string; color?: string }
interface HealthScore {
  total: number;
  band: string | BandObj;
}

interface Props {
  vehicle: any;
  onPress?: () => void;
  score?: HealthScore | null;
}

const BAND_KEY: Record<string, string> = {
  excellent: 'vehicle_card.health_excellent',
  good:      'vehicle_card.health_good',
  caution:   'vehicle_card.health_caution',
  poor:      'vehicle_card.health_poor',
  critical:  'vehicle_card.health_critical',
};

export default function VehicleCard({ vehicle, onPress, score }: Props) {
  const colors = useColors();
  const t = useT();
  const name = vehicle.ten ?? vehicle.name;
  const hasPhoto = !!vehicle.anh_url;

  const bandKey: string | undefined = score?.band
    ? (typeof score.band === 'object' ? score.band.key : score.band)
    : undefined;
  const bandLabel: string | undefined = score?.band
    ? (typeof score.band === 'object' ? score.band.label : (BAND_KEY[score.band] ? t(BAND_KEY[score.band] as any) : undefined))
    : undefined;

  const bandColor = (key: string) => {
    if (key === 'excellent' || key === 'good') return colors.success;
    if (key === 'caution') return colors.warning;
    return colors.error;
  };

  const subtitleParts: string[] = [];
  if (vehicle.make)  subtitleParts.push(vehicle.make);
  if (vehicle.model) subtitleParts.push(vehicle.model);
  if (vehicle.nam)   subtitleParts.push(String(vehicle.nam));
  const subtitle = subtitleParts.join(' · ');

  const fuel = fuelTypeMeta(vehicle);

  const row3Parts: string[] = [];
  if (vehicle.tank_capacity_l)  row3Parts.push(`${vehicle.tank_capacity_l}L`);
  if (vehicle.odo_hien_tai != null) {
    row3Parts.push(`ODO: ${Number(vehicle.odo_hien_tai).toLocaleString('vi-VN')}km`);
  }
  const row3 = row3Parts.join(' · ');

  const inner = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 120 }}>
        <FontAwesome5 name={vehicleIcon(vehicle)} size={14} color={colors.primary} solid />
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>
          {name}
        </Text>
        {vehicle.is_default && (
          <FontAwesome5 name="star" size={14} color={colors.primary} solid />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {vehicle.fuel_type && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            backgroundColor: fuel.color + '22',
            borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
          }}>
            <FontAwesome5 name={fuel.icon} size={10} color={fuel.color} solid />
            <Text style={{ color: fuel.color, fontSize: 11, fontWeight: '700' }}>
              {vehicle.fuel_type}
            </Text>
          </View>
        )}
        {bandKey && bandLabel && score?.total != null && (
          <View style={{
            backgroundColor: bandColor(bandKey) + '22',
            borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
          }}>
            <Text style={{ color: bandColor(bandKey), fontSize: 11, fontWeight: '700' }}>
              {score.total} · {bandLabel}
            </Text>
          </View>
        )}
      </View>

      {subtitle ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>{subtitle}</Text>
      ) : null}

      {row3 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{row3}</Text>
      ) : null}
    </>
  );

  const touchStyle = {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden' as const,
    borderWidth: vehicle.is_default ? 1.5 : 0,
    borderColor: colors.primary,
  };

  if (hasPhoto) {
    return (
      <TouchableOpacity onPress={onPress} style={touchStyle}>
        <ImageBackground
          source={{ uri: vehicle.anh_url }}
          style={{ padding: 16, backgroundColor: colors.surface }}
          imageStyle={{ opacity: 0.22 }}
          resizeMode="cover">
          {inner}
        </ImageBackground>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} style={[touchStyle, { backgroundColor: colors.surface, padding: 16 }]}>
      {inner}
    </TouchableOpacity>
  );
}
