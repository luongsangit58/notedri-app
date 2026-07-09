import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { achievementsApi, Badge, AchievementLevel, LevelItem } from '../../api/achievements';
import AppBgPattern from '../../components/AppBgPattern';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';

// FA6-only icons → FA5 fallbacks
const ICON_FALLBACK: Record<string, string> = {
  'mountain-sun': 'mountain',
  'gauge-high':   'tachometer-alt',
};
function safeIcon(icon: string): string {
  return ICON_FALLBACK[icon] ?? icon;
}

const LEVEL_COLORS: Record<string, string> = {
  slate:   '#94a3b8',
  sky:     '#0ea5e9',
  amber:   '#f59e0b',
  violet:  '#7c3aed',
  fuchsia: '#d946ef',
  rose:    '#f43f5e',
};
// Level n (1-6) maps to color names in the same order as PHP LEVELS array
const LV_COLOR_NAMES = ['slate', 'sky', 'amber', 'violet', 'fuchsia', 'rose'];

function levelColor(color: string, fallback: string): string {
  return LEVEL_COLORS[color] ?? fallback;
}

// ===== Aurora blob (animates translate + scale) =====
function AuroraBlob({
  color, size, top, left, bottom, right,
  txRange, tyRange, scaleRange, duration, delay,
}: {
  color: string; size: number;
  top?: number; left?: number; bottom?: number; right?: number;
  txRange: number; tyRange: number; scaleRange: number;
  duration: number; delay: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, []);
  const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [0, txRange] });
  const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, tyRange] });
  const sc = anim.interpolate({ inputRange: [0, 1], outputRange: [1, scaleRange] });
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, opacity: 0.28,
      top, left, bottom, right,
      transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
    }} />
  );
}

// ===== Twinkling spark particle =====
function Spark({ size, top, left, delay }: { size: number; top: number; left: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1300, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(anim, { toValue: 0, duration: 1300, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    );
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.3] });
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', top, left,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#fff',
      opacity, transform: [{ scale }],
    }} />
  );
}

// ===== Medal halo (breathing glow behind medal) =====
function MedalHalo() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(anim, { toValue: 0, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.85] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', width: 140, height: 140, borderRadius: 70,
      backgroundColor: 'rgba(245,158,11,0.45)',
      opacity, transform: [{ scale }],
    }} />
  );
}

// ===== Hero Card =====
function LevelHeroCard({
  level, earned, total, levels, is_premium, free_ceiling_hit,
}: {
  level: AchievementLevel;
  earned: number;
  total: number;
  levels: LevelItem[];
  is_premium: boolean;
  free_ceiling_hit: boolean;
}) {
  const t = useT();
  const lc = levelColor(level.color, '#f59e0b');
  // Free user đạt đủ pool Free nhưng LV6 cần Premium → progress bar đóng băng ở 100%
  const nextIsPremiumGated = !is_premium && !level.is_max && level.level >= 5;
  const progress = level.is_max || nextIsPremiumGated
    ? 1
    : level.span_to > level.span_from
      ? Math.min(1, (earned - level.span_from) / (level.span_to - level.span_from))
      : 1;
  const pct = Math.max(4, Math.round(progress * 100));

  return (
    <View style={styles.hero}>
      {/* Aurora blobs - trôi chậm phía sau */}
      <AuroraBlob color="#f59e0b" size={220} top={-70} right={-40}
        txRange={-28} tyRange={20} scaleRange={1.12} duration={9000} delay={0} />
      <AuroraBlob color="#a855f7" size={200} bottom={-80} left={-30}
        txRange={24} tyRange={-18} scaleRange={1.16} duration={11000} delay={400} />
      <AuroraBlob color="#38bdf8" size={160} top={60} left={90}
        txRange={-16} tyRange={12} scaleRange={1.1} duration={13000} delay={800} />

      {/* Đốm sáng lấp lánh */}
      <Spark size={7} top={38} left={32}  delay={0} />
      <Spark size={5} top={56} left={220} delay={500} />
      <Spark size={6} top={130} left={50} delay={1000} />
      <Spark size={8} top={110} left={275} delay={1400} />
      <Spark size={4} top={28} left={170} delay={800} />
      <Spark size={5} top={160} left={140} delay={1800} />

      {/* Medal + halo */}
      <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 12, height: 88 }}>
        <MedalHalo />
        <View style={[styles.heroMedal, { backgroundColor: lc + '33', borderColor: lc + '88',
          shadowColor: lc, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 }]}>
          <FontAwesome5 name={safeIcon(level.icon)} size={28} color={lc} solid />
        </View>
      </View>

      {/* Tên cấp độ */}
      <View style={styles.heroLevelBadge}>
        <Text style={[styles.heroLvLabel, { color: '#fbbf24' }]}>LV.{level.level}</Text>
        <View style={styles.heroLvDivider} />
        <Text style={styles.heroLvName}>{level.name}</Text>
      </View>

      {/* Chip "Vô địch Free" khi đạt toàn bộ pool Free */}
      {free_ceiling_hit && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
          backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
          paddingHorizontal: 14, paddingVertical: 5,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
          alignSelf: 'center',
        }}>
          <FontAwesome5 name="shield-alt" size={11} color="#cbd5e1" solid />
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {t('achievements.free_champion')}
          </Text>
          <FontAwesome5 name="check-circle" size={11} color="#6ee7b7" solid />
        </View>
      )}

      {/* Số huy hiệu */}
      <Text style={styles.heroCount}>
        {earned}<Text style={styles.heroCountTotal}>/{total}</Text>
      </Text>
      <Text style={styles.heroCountLabel}>{t('achievements.badges_earned')}</Text>

      {/* Thanh tiến độ */}
      <View style={styles.heroBarWrap}>
        <View style={styles.heroBarTrack}>
          <View style={[styles.heroBarFill, {
            width: `${pct}%` as any,
            backgroundColor: nextIsPremiumGated ? '#a78bfa' : undefined,
          }]} />
        </View>
        <Text style={styles.heroBarLabel}>
          {level.is_max
            ? t('achievements.max_level')
            : nextIsPremiumGated
              ? t('achievements.premium_for_lv6')
              : t('achievements.to_next_level', { to_next: level.to_next, next_name: level.next_name ?? '' })}
        </Text>
      </View>

      {/* Lộ trình cấp - cuộn ngang */}
      {levels.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.ladderScroll}
          contentContainerStyle={styles.ladderContent}>
          {levels.map((l) => {
            const isCurrent = l.current;
            const isReached = l.reached && !l.current;
            // LV6 luôn cần Premium - đánh dấu tím cho Free user
            const isPremiumGated = !is_premium && l.n === 6;
            return (
              <View
                key={l.n}
                style={[
                  styles.ladderPill,
                  isCurrent
                    ? { backgroundColor: '#f59e0b', borderColor: '#fcd34d' }
                    : isPremiumGated
                      ? { backgroundColor: 'rgba(167,139,250,0.15)', borderColor: 'rgba(167,139,250,0.3)' }
                      : isReached
                        ? { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)' }
                        : { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.10)' },
                ]}>
                <View style={[
                  styles.ladderPillIcon,
                  { backgroundColor: isCurrent ? 'rgba(0,0,0,0.15)' : isPremiumGated ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.15)' },
                ]}>
                  <FontAwesome5
                    name={isPremiumGated ? 'lock' : safeIcon(l.icon)}
                    size={10}
                    color={isCurrent ? '#1e1b4b' : isPremiumGated ? '#a78bfa' : '#fff'}
                    solid
                  />
                </View>
                <View>
                  <Text style={[
                    styles.ladderPillName,
                    { color: isCurrent ? '#1e1b4b' : isPremiumGated ? '#c4b5fd' : isReached ? '#fff' : 'rgba(199,210,254,0.7)' },
                  ]}>
                    {'LV.' + l.n + ' · ' + l.name}
                  </Text>
                  <Text style={[
                    styles.ladderPillSub,
                    { color: isCurrent ? 'rgba(30,27,75,0.7)' : isPremiumGated ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.55)' },
                  ]}>
                    {isPremiumGated
                      ? t('achievements.premium_lock_title')
                      : (l.min === 0 ? t('achievements.ladder_start') : ('≥ ' + l.min + ' ' + t('achievements.badges_earned')))
                        + (isCurrent ? ' · ' + t('achievements.ladder_here') : isReached ? ' ✓' : '')}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ===== Badge earned glow animation =====
function EarnedGlow({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(anim, { toValue: 0, duration: 1600, useNativeDriver: false, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.65] });
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', inset: 0 as any,
      borderRadius: 14, borderWidth: 2, borderColor: color,
      opacity,
    }} />
  );
}

// ===== Badge Card =====
function BadgeCard({ b }: { b: Badge }) {
  const colors = useColors();
  const t = useT();
  const isPremiumLocked = b.locked_premium;
  const isHiddenLocked = b.hidden && !b.earned && !isPremiumLocked;
  const isHiddenEarned = b.hidden && b.earned;

  const glowColor = isHiddenEarned ? '#a855f7' : '#f59e0b';
  const iconBg = isPremiumLocked
    ? 'rgba(245,158,11,0.12)'
    : b.earned
      ? (isHiddenEarned ? 'rgba(168,85,247,0.25)' : 'rgba(245,158,11,0.25)')
      : colors.border;
  const iconColor = isPremiumLocked
    ? '#f59e0b88'
    : b.earned
      ? (isHiddenEarned ? '#a855f7' : '#f59e0b')
      : colors.textSecondary;
  const cardBg = isPremiumLocked
    ? 'rgba(245,158,11,0.05)'
    : b.earned
      ? (isHiddenEarned ? 'rgba(109,40,217,0.10)' : 'rgba(245,158,11,0.08)')
      : colors.surface;
  const earnedColor = isHiddenEarned ? '#a855f7' : '#10b981';

  return (
    <View style={[
      styles.badge,
      {
        backgroundColor: cardBg,
        borderColor: isPremiumLocked
          ? '#f59e0b33'
          : b.earned
            ? (isHiddenEarned ? '#7c3aed55' : '#f59e0b55')
            : colors.border,
        opacity: (b.earned || isPremiumLocked) ? 1 : 0.65,
      },
    ]}>
      {b.earned && <EarnedGlow color={glowColor} />}

      <View style={[styles.badgeIcon, { backgroundColor: iconBg }]}>
        <FontAwesome5
          name={isPremiumLocked ? 'crown' : isHiddenLocked ? 'question' : safeIcon(b.icon)}
          size={18}
          color={iconColor}
          solid
        />
      </View>
      <Text style={{ color: isPremiumLocked ? colors.textSecondary : colors.text, fontSize: 12, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
        {isPremiumLocked ? t('achievements.premium_lock_title') : isHiddenLocked ? t('achievements.secret_title') : b.title}
      </Text>
      {isPremiumLocked ? (
        <Text style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 2 }}>
          {t('achievements.premium_lock_desc')}
        </Text>
      ) : !isHiddenLocked && b.desc ? (
        <Text style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 2 }} numberOfLines={2}>
          {b.desc}
        </Text>
      ) : isHiddenLocked ? (
        <Text style={{ color: colors.textSecondary, fontSize: 10, textAlign: 'center', marginTop: 2 }}>
          {t('achievements.hidden_badge')}
        </Text>
      ) : null}
      {b.progress && !b.earned && !isPremiumLocked ? (
        <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'center' }}>
          {b.progress}
        </Text>
      ) : null}
      {b.earned ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
          <FontAwesome5 name="check-circle" size={9} color={earnedColor} solid />
          <Text style={{ color: earnedColor, fontSize: 10, fontWeight: '700' }}>{t('achievements.earned_label')}</Text>
        </View>
      ) : isPremiumLocked ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
          <FontAwesome5 name="lock" size={9} color="#f59e0b88" solid />
          <Text style={{ color: '#f59e0b88', fontSize: 10, fontWeight: '700' }}>Premium</Text>
        </View>
      ) : null}
    </View>
  );
}

// ===== Main Screen =====
export default function AchievementsScreen() {
  const nav = useNavigation<any>();
  const colors = useColors();
  const t = useT();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['achievements'],
    queryFn: () => achievementsApi.get().then((r) => r.data.data),
  });

  const badges: Badge[] = Array.isArray(data?.badges) ? data.badges : [];
  const earned = data?.earned ?? 0;
  const total = data?.total ?? badges.length;
  const tiers: Record<string, string> = data?.tiers ?? {};
  const level = data?.level ?? null;
  const levels: LevelItem[] = Array.isArray(data?.levels) ? data.levels : [];
  const is_premium = data?.is_premium ?? false;
  const free_ceiling_hit = data?.free_ceiling_hit ?? false;

  // Group badges by tier - include hidden+unearned (shown as Bí mật)
  const tierNums = [1, 2, 3, 4];
  const grouped = tierNums
    .map(n => ({
      num: n,
      name: tiers[String(n)] ?? t('achievements.tier_group', { n }),
      badges: badges.filter(b => b.tier === n),
    }))
    .filter(g => g.badges.length > 0);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <AppBgPattern />
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => nav.goBack()} style={{ padding: 4 }}>
          <FontAwesome5 name="arrow-left" size={16} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('achievements.title')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.primary} />}>

          {/* Hero card: level + ladder */}
          {level && (
            <LevelHeroCard
              level={level} earned={earned} total={total} levels={levels}
              is_premium={is_premium} free_ceiling_hit={free_ceiling_hit}
            />
          )}

          {/* Tier sections */}
          {grouped.map(g => {
            const tEarned = g.badges.filter(b => b.earned).length;
            // Chỉ đếm badge không bị Premium-lock vào "tổng" của tier (giống web)
            const tAll = g.badges.filter(b => !b.locked_premium).length;
            return (
              <View key={g.num} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <View style={styles.tierNumBadge}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{g.num}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{g.name}</Text>
                  <Text style={{ color: tEarned === tAll && tAll > 0 ? '#10b981' : '#f59e0b', fontSize: 12, fontWeight: '600' }}>
                    {tEarned}/{tAll}
                  </Text>
                  {tEarned === tAll && tAll > 0 && (
                    <FontAwesome5 name="check-circle" size={12} color="#10b981" solid />
                  )}
                </View>
                <View style={styles.grid}>
                  {g.badges.map(b => <BadgeCard key={b.key} b={b} />)}
                </View>
              </View>
            );
          })}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  // Hero
  hero: {
    backgroundColor: '#1e1b4b',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    shadowColor: '#f59e0b',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  heroMedal: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroLevelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', marginBottom: 12,
  },
  heroLvLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  heroLvDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroLvName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  heroCount: { color: '#fff', fontSize: 32, fontWeight: '900', lineHeight: 36 },
  heroCountTotal: { color: '#fbbf24', fontSize: 22, fontWeight: '700' },
  heroCountLabel: { color: '#c7d2fe', fontSize: 12, fontWeight: '500', marginTop: 2, marginBottom: 14 },
  heroBarWrap: { width: '100%', maxWidth: 280, marginBottom: 16 },
  heroBarTrack: {
    height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroBarFill: { height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },
  heroBarLabel: { color: 'rgba(253,230,138,0.9)', fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // Level ladder
  ladderScroll: { alignSelf: 'stretch', marginHorizontal: -4 },
  ladderContent: { paddingHorizontal: 4, gap: 6, flexDirection: 'row' },
  ladderPill: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 99, paddingLeft: 4, paddingRight: 10, paddingVertical: 4,
    borderWidth: 1,
  },
  ladderPillIcon: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  ladderPillName: { fontSize: 10, fontWeight: '700' },
  ladderPillSub: { fontSize: 9, marginTop: 1 },

  // Tier
  tierNumBadge: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: '#f59e0b', alignItems: 'center', justifyContent: 'center',
  },

  // Badge grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    width: '48%', borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center',
  },
  badgeIcon: {
    width: 44, height: 44, borderRadius: 22, marginBottom: 8,
    alignItems: 'center', justifyContent: 'center',
  },
});
