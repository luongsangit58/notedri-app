import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import client from '../../api/client';
import { useColors } from '../../utils/theme';

const LOAI_OPTIONS = [
  { key: 'loi',     label: 'Lỗi / trục trặc', icon: 'bug' },
  { key: 'y_tuong', label: 'Ý tưởng / đề xuất', icon: 'lightbulb' },
  { key: 'khac',    label: 'Góp ý khác', icon: 'comment-alt' },
] as const;

type LoaiKey = typeof LOAI_OPTIONS[number]['key'];

const STARS = [1, 2, 3, 4, 5];

export default function FeedbackScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const [loai, setLoai] = useState<LoaiKey>('loi');
  const [noi_dung, setNoiDung] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () => client.post('/feedback', { loai, noi_dung, rating }),
    onSuccess: () => {
      Alert.alert('Cảm ơn!', 'Góp ý của bạn đã được ghi nhận.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'Có lỗi xảy ra.';
      Alert.alert('Lỗi', msg);
    },
  });

  const canSubmit = noi_dung.trim().length >= 10 && !isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20, marginBottom: 4 }}>
          Góp ý cho NoteDri
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
          Bạn thấy gì chưa ổn? Có ý tưởng gì hay? Nhóm phát triển đọc hết.
        </Text>

        {/* Loại */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Loại góp ý
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {LOAI_OPTIONS.map(opt => {
            const selected = loai === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setLoai(opt.key)}
                style={{
                  flex: 1, borderRadius: 10, padding: 10, alignItems: 'center',
                  backgroundColor: selected ? colors.primary + '22' : colors.surface,
                  borderWidth: 1.5, borderColor: selected ? colors.primary : colors.border,
                }}>
                <FontAwesome5 name={opt.icon} size={16} color={selected ? colors.primary : colors.textSecondary} solid />
                <Text style={{
                  color: selected ? colors.primary : colors.textSecondary,
                  fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'center',
                }}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Rating */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Đánh giá tổng thể (tuỳ chọn)
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {STARS.map(s => (
            <TouchableOpacity key={s} onPress={() => setRating(rating === s ? null : s)}>
              <FontAwesome5
                name="star"
                size={28}
                color={(rating ?? 0) >= s ? '#F59E0B' : colors.border}
                solid={(rating ?? 0) >= s}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Nội dung */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Nội dung
        </Text>
        <TextInput
          value={noi_dung}
          onChangeText={setNoiDung}
          multiline
          numberOfLines={6}
          placeholder="Mô tả chi tiết — bước nào xảy ra, trên thiết bị gì, kỳ vọng là gì..."
          placeholderTextColor={colors.textSecondary}
          style={{
            backgroundColor: colors.surface, color: colors.text,
            borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 20,
            minHeight: 120, textAlignVertical: 'top',
            borderWidth: 1, borderColor: colors.border, marginBottom: 8,
          }}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 24, textAlign: 'right' }}>
          {noi_dung.trim().length} / 2000 ký tự (tối thiểu 10)
        </Text>

        <TouchableOpacity
          onPress={() => mutate()}
          disabled={!canSubmit}
          style={{
            backgroundColor: colors.primary, borderRadius: 12,
            paddingVertical: 15, alignItems: 'center',
            opacity: canSubmit ? 1 : 0.4,
          }}>
          {isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Gửi góp ý</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
