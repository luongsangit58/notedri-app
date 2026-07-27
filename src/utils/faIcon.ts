// FA6-only icon names → FA5 fallbacks. App bundles FontAwesome5Free (via
// @expo/vector-icons) - tên icon FA6 (đổi tên/gộp icon so với FA5) hiện ô
// trống/dấu hỏi thay vì icon thật. Backend (achievements: AchievementService.php
// levels + AchievementCatalogSeeder.php badges) đặt tên icon theo chuẩn FA6 mới
// hơn app đang dùng - đối chiếu trực tiếp với glyph map thật
// (FontAwesome5Free.json) để chắc từng key dưới đây thật sự cần, không đoán.
//
// Dùng chung cho mọi nơi hiện `level.icon`/`badge.icon` từ API achievements
// (AchievementsScreen.tsx VÀ ProfileScreen.tsx đều hiện icon cấp độ - rà soát
// 27/7: ProfileScreen từng hiện thẳng level.icon không qua fallback này, hiện
// "?" cho LV4 "gauge-high").
const FA6_TO_FA5: Record<string, string> = {
  'mountain-sun': 'mountain',
  'gauge-high': 'tachometer-alt',
  gauge: 'tachometer-alt',
  'screwdriver-wrench': 'tools',
  'heart-pulse': 'heartbeat',
  'calendar-days': 'calendar-alt',
};

export function safeFaIcon(icon: string): string {
  return FA6_TO_FA5[icon] ?? icon;
}
