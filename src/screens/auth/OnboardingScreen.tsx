import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, useWindowDimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '../../i18n';
import { C, BgPattern } from './_authLayout';

export const ONBOARDING_SEEN_KEY = 'onboarding_seen';

type Slide = { icon: string; title: string; desc: string };

export default function OnboardingScreen({ navigation }: { navigation: any }) {
  const t = useT();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const slides: Slide[] = [
    { icon: 'bolt',              title: t('onboarding.s1_title'), desc: t('onboarding.s1_desc') },
    { icon: 'route',            title: t('onboarding.s2_title'), desc: t('onboarding.s2_desc') },
    { icon: 'camera',           title: t('onboarding.s3_title'), desc: t('onboarding.s3_desc') },
    { icon: 'heartbeat',        title: t('onboarding.s4_title'), desc: t('onboarding.s4_desc') },
  ];
  const isLast = index === slides.length - 1;

  const finish = async (dest: 'Register' | 'Login') => {
    try { await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch {}
    navigation.replace(dest);
  };

  const next = () => {
    if (isLast) { finish('Register'); return; }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  const onScroll = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" />
      <BgPattern />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {/* Bỏ qua */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 8 }}>
          <TouchableOpacity onPress={() => finish('Login')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: C.textSecondary, fontSize: 14, fontWeight: '600' }}>
              {t('onboarding.skip')}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          renderItem={({ item }) => (
            <View style={{ width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
              <View style={{
                width: 108, height: 108, borderRadius: 30, marginBottom: 36,
                backgroundColor: C.primary + '1f', alignItems: 'center', justifyContent: 'center',
              }}>
                <FontAwesome5 name={item.icon} size={46} color={C.primary} solid />
              </View>
              <Text style={{ color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 14 }}>
                {item.title}
              </Text>
              <Text style={{ color: C.textMuted, fontSize: 15, lineHeight: 23, textAlign: 'center' }}>
                {item.desc}
              </Text>
            </View>
          )}
        />

        {/* Dots */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                height: 8, borderRadius: 4,
                width: i === index ? 22 : 8,
                backgroundColor: i === index ? C.primary : C.inputBorder,
              }}
            />
          ))}
        </View>

        {/* CTA */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
          <TouchableOpacity
            onPress={next}
            style={{ backgroundColor: C.primary, paddingVertical: 16, borderRadius: 14, alignItems: 'center' }}>
            <Text style={{ color: '#1c1917', fontWeight: '700', fontSize: 16 }}>
              {isLast ? t('onboarding.start') : t('onboarding.next')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => finish('Login')} style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ color: C.textSecondary, fontSize: 14 }}>
              {t('onboarding.have_account')}{' '}
              <Text style={{ color: C.primary, fontWeight: '700' }}>{t('onboarding.login')}</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}
