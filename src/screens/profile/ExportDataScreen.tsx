import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import client from '../../api/client';
import { colors } from '../../utils/colors';

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <FontAwesome5 name={icon as any} size={14} color={colors.textSecondary} solid style={{ width: 22 }} />
      <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 14, marginLeft: 10 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{value}</Text>
    </View>
  );
}

export default function ExportDataScreen() {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await client.get('/account/export');
      const exportData = res.data?.data ?? res.data;
      setPreview(exportData);
    } catch {
      Alert.alert('Lỗi', 'Không thể tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!preview) return;
    const json = JSON.stringify(preview, null, 2);
    await Share.share({
      message: json,
      title: 'Dữ liệu NoteDri',
    });
  };

  const vehicleCount = preview?.vehicles?.length ?? 0;
  const refuelCount = preview?.refuels?.length ?? 0;
  const serviceCount = preview?.vehicles?.reduce(
    (acc: number, v: any) => acc + (v.service_logs?.length ?? 0), 0
  ) ?? 0;
  const odoCount = preview?.vehicles?.reduce(
    (acc: number, v: any) => acc + (v.odometer_readings?.length ?? 0), 0
  ) ?? 0;
  const reminderCount = preview?.vehicles?.reduce(
    (acc: number, v: any) => acc + (v.reminders?.length ?? 0), 0
  ) ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        {/* Header card */}
        <View style={{
          backgroundColor: colors.surface, borderRadius: 14, padding: 20, marginBottom: 20, alignItems: 'center',
        }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <FontAwesome5 name="download" size={26} color={colors.primary} solid />
          </View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>
            Xuất dữ liệu
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 18 }}>
            Tải toàn bộ dữ liệu xe, lịch sử đổ xăng, bảo dưỡng và lời nhắc về dưới dạng JSON.
          </Text>
        </View>

        {/* What's included */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 16, marginBottom: 20 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, paddingTop: 14, paddingBottom: 4 }}>
            Dữ liệu bao gồm
          </Text>
          <InfoRow icon="car-side"   label="Xe" value={preview ? vehicleCount : '—'} />
          <InfoRow icon="gas-pump"   label="Lịch sử đổ xăng" value={preview ? refuelCount : '—'} />
          <InfoRow icon="wrench"     label="Bảo dưỡng" value={preview ? serviceCount : '—'} />
          <InfoRow icon="road"       label="Mốc ODO" value={preview ? odoCount : '—'} />
          <InfoRow icon="bell"       label="Lời nhắc" value={preview ? reminderCount : '—'} />
          {preview?.exported_at && (
            <View style={{ paddingVertical: 10 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                Xuất lúc: {new Date(preview.exported_at).toLocaleString('vi-VN')}
              </Text>
            </View>
          )}
        </View>

        {/* Actions */}
        {!preview ? (
          <TouchableOpacity
            onPress={handleExport}
            disabled={loading}
            style={{
              backgroundColor: colors.primary, borderRadius: 12,
              paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
              opacity: loading ? 0.6 : 1,
            }}>
            {loading
              ? <ActivityIndicator color="#fff" />
              : <>
                  <FontAwesome5 name="download" size={16} color="#fff" solid />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Tải dữ liệu</Text>
                </>
            }
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 12 }}>
            <TouchableOpacity
              onPress={handleShare}
              style={{
                backgroundColor: colors.primary, borderRadius: 12,
                paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
              }}>
              <FontAwesome5 name="share-alt" size={16} color="#fff" solid />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Chia sẻ / Lưu JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setPreview(null); }}
              style={{
                backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
                paddingVertical: 14, alignItems: 'center',
              }}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Tải lại</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 }}>
          Dữ liệu của bạn thuộc về bạn. NoteDri không bán hay chia sẻ thông tin này với bên thứ ba.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
