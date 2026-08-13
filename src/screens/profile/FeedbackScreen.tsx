import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../../api/client';
import { useColors } from '../../utils/theme';
import { useT, useI18nStore } from '../../i18n';
import AppBgPattern from '../../components/AppBgPattern';

type LoaiKey = 'loi' | 'y_tuong' | 'khac';

const STARS = [1, 2, 3, 4, 5];
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.notedri';
const STORE_REVIEW_PROMPTED_KEY = 'store_review_prompted';

/**
 * Chỉ mời đánh giá Google Play khi user vừa cho 4-5 sao NGAY TRONG APP (đã chứng tỏ hài
 * lòng) - không chặn/mời user đang cho điểm thấp lên store công khai. Chỉ hỏi 1 LẦN DUY
 * NHẤT (đánh dấu AsyncStorage) dù sau này còn gửi góp ý tích cực nữa - tránh làm phiền.
 */
async function maybePromptStoreReview() {
  try {
    if (await AsyncStorage.getItem(STORE_REVIEW_PROMPTED_KEY)) return;
    await AsyncStorage.setItem(STORE_REVIEW_PROMPTED_KEY, '1');
    const t = useI18nStore.getState().t;
    Alert.alert(
      t('feedback.store_review_title'),
      t('feedback.store_review_body'),
      [
        { text: t('feedback.store_review_later'), style: 'cancel' },
        { text: t('feedback.store_review_cta'), onPress: () => Linking.openURL(PLAY_STORE_URL) },
      ],
    );
  } catch { /* ignore - không quan trọng bằng luồng góp ý chính */ }
}

export default function FeedbackScreen() {
  const colors = useColors();
  const t = useT();
  const navigation = useNavigation<any>();
  const [loai, setLoai] = useState<LoaiKey>('loi');
  const [noi_dung, setNoiDung] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  const LOAI_OPTIONS: { key: LoaiKey; label: string; icon: string }[] = [
    { key: 'loi',     label: t('feedback.type_bug'),   icon: 'bug' },
    { key: 'y_tuong', label: t('feedback.type_idea'),  icon: 'lightbulb' },
    { key: 'khac',    label: t('feedback.type_other'), icon: 'comment-alt' },
  ];

  const { mutate, isPending } = useMutation({
    mutationFn: () => client.post('/feedback', { loai, noi_dung, rating }),
    onSuccess: () => {
      const isHappy = (rating ?? 0) >= 4;
      Alert.alert(t('feedback.success_title'), t('feedback.success_message'), [
        {
          text: 'OK',
          onPress: () => {
            navigation.goBack();
            // Delay nhỏ để Alert "Cảm ơn" đóng hẳn trước khi mở Alert mời đánh giá store -
            // gọi 2 Alert.alert liền nhau (đặc biệt trên iOS) dễ bị chồng/mất Alert sau.
            if (isHappy) setTimeout(maybePromptStoreReview, 300);
          },
        },
      ]);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? t('common.error_generic');
      Alert.alert(t('common.error'), msg);
    },
  });

  const canSubmit = noi_dung.trim().length >= 10 && !isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'left', 'right']}>
      <AppBgPattern />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, width: '100%', maxWidth: 720, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">

        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 20, marginBottom: 4 }}>
          {t('feedback.heading')}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 24 }}>
          {t('feedback.subheading')}
        </Text>

        {/* Loại */}
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          {t('feedback.type_label')}
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
          {t('feedback.rating_label')}
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
          {t('feedback.content_label')}
        </Text>
        <TextInput
          value={noi_dung}
          onChangeText={setNoiDung}
          multiline
          numberOfLines={6}
          placeholder={t('feedback.placeholder_detailed')}
          placeholderTextColor={colors.textSecondary}
          style={{
            backgroundColor: colors.surface, color: colors.text,
            borderRadius: 12, padding: 14, fontSize: 14, lineHeight: 20,
            minHeight: 120, textAlignVertical: 'top',
            borderWidth: 1, borderColor: colors.border, marginBottom: 8,
          }}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 24, textAlign: 'right' }}>
          {t('feedback.char_count', { count: noi_dung.trim().length })}
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
            ? <ActivityIndicator color={colors.primaryText} />
            : <Text style={{ color: colors.primaryText, fontWeight: '700', fontSize: 16 }}>{t('feedback.submit')}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
