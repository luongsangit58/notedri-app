import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../utils/theme';
import { useT } from '../../i18n';
import RemindersScreen from '../reminders/RemindersScreen';
import HealthScreen from '../health/HealthScreen';

type Tab = 0 | 1;

export default function QuanLyScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState<Tab>(0);
  // Cho phep dieu huong tu Trang chu (vd bam Loi nhac) mo dung tab.
  // _ts thay doi moi lan navigate de effect chay lai ke ca khi tab lap lai gia tri.
  useEffect(() => {
    const tab = route.params?.tab;
    if (tab === 0 || tab === 1) setActiveTab(tab as Tab);
  }, [route.params?.tab, route.params?._ts]);
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const t = useT();

  const TABS = [
    { label: t('management.tab_reminders'), icon: 'calendar-alt' },
    { label: t('management.tab_health'),    icon: 'heartbeat' },
  ];

  const childInsets = { top: 0, bottom: insets.bottom, left: insets.left, right: insets.right };

  // Rà soát 27/7 (đối chiếu web: nhóm "Quản lý" trên web gồm Sức khỏe + OBD2 +
  // Lời nhắc, còn mobile thiếu OBD2) - từng thêm mục OBD2 cho khớp nhóm với web.
  // Rà soát 15/8 (góp ý user: OBD2 đã có thẻ CTA riêng rất to ngay đầu Home rồi,
  // nhồi thêm lối tắt ở đây là thừa/trùng lặp) - đổi sang "Sổ tay xe" (Dossier).
  // Rà soát tiếp cùng ngày (góp ý user: muốn 1 tính năng user quan tâm hơn) -
  // đổi tiếp sang "Bảo dưỡng" (lịch sử sửa chữa/chi phí, ServicesScreen): hoàn
  // thiện đúng bộ ba "sắp làm gì" (Lời nhắc) + "xe đang thế nào" (Kiểm tra xe) +
  // "đã làm gì rồi" (Bảo dưỡng) - hợp tinh thần "Quản lý" hơn Sổ tay xe (thiên
  // về xem tóm tắt/chia sẻ khi bán xe). Bảo dưỡng trước đây CŨNG chỉ có đúng 1
  // lối vào (thẻ trên Home) - cùng tình trạng "mồ côi lối tắt" Dossier từng có.
  // KHÔNG làm 1 tab nội dung như 2 tab trên (ServicesScreen tự quản lý chọn xe
  // riêng, không hợp nhồi làm nội dung con tĩnh) - bấm vào điều hướng thẳng
  // sang màn Bảo dưỡng, không đổi activeTab.
  function goToServices() {
    navigation.navigate('Services');
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Tab bar */}
      <View style={[styles.tabBar, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((tab, i) => {
          const active = activeTab === i;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => setActiveTab(i as Tab)}
              style={styles.tabItem}
              activeOpacity={0.75}>
              <FontAwesome5
                name={tab.icon}
                size={13}
                color={active ? colors.primary : colors.textSecondary}
                solid
              />
              <Text style={[styles.tabLabel, { color: active ? colors.primary : colors.textSecondary }]}>
                {tab.label}
              </Text>
              {active && <View style={[styles.tabIndicator, { backgroundColor: colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
        {/* Rà soát 14/8 (audit menu: mục lối tắt dùng CHUNG style tabItem với 2 tab
            nội dung thật ở trên, chỉ khác 1 icon external-link 8px giấu trong
            góc - nhìn như tab thứ 3 nhưng bấm vào lại điều hướng đi hẳn, dễ
            gây hiểu nhầm). Thêm vạch phân cách + đổi icon external-link sang
            đứng cạnh nhãn (rõ ràng hơn overlay góc), giảm flex để không chiếm
            tỉ trọng ngang bằng 2 tab thật - tín hiệu thị giác "đây là lối tắt,
            không phải tab" rõ hơn mà không cần đổi hành vi/điều hướng. */}
        <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 10 }} />
        <TouchableOpacity onPress={goToServices} style={[styles.tabItem, { flex: 0.75 }]} activeOpacity={0.75}>
          <FontAwesome5 name="wrench" size={13} color={colors.textSecondary} solid />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Text style={[styles.tabLabel, { color: colors.textSecondary }]}>
              {t('nav.tab_services')}
            </Text>
            <FontAwesome5 name="external-link-alt" size={9} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <SafeAreaInsetsContext.Provider value={childInsets}>
        <View style={{ flex: 1 }}>
          {activeTab === 0 && <RemindersScreen />}
          {activeTab === 1 && <HealthScreen embedded />}
        </View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
    gap: 3,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 1,
  },
});
