import client from './client';

export type Badge = {
  key: string;
  tier: number;
  icon: string;
  title: string;
  desc: string | null;
  earned: boolean;
  progress: string | null;
  hidden: boolean;
  locked_premium: boolean;
};

export type AchievementLevel = {
  level: number;
  name: string;
  icon: string;
  color: string;
  is_max: boolean;
  next_name: string | null;
  to_next: number;
  span_from: number;
  span_to: number;
};

export type LevelItem = {
  n: number;
  name: string;
  icon: string;
  min: number;
  reached: boolean;
  current: boolean;
};

export type AchievementSummary = {
  earned: number;
  total: number;
  badges: Badge[];
  tiers: Record<string, string>;
  level: AchievementLevel;
  levels: LevelItem[];
  is_premium: boolean;
  free_ceiling_hit: boolean;
};

export const achievementsApi = {
  get: () => client.get<{ data: AchievementSummary }>('/achievements'),
};
