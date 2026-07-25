import { Alert } from 'react-native';
import { useI18nStore } from '../../i18n';

/**
 * Công bố nổi bật (prominent disclosure) bắt buộc theo chính sách Google Play:
 * phải giải thích lý do xin vị trí NỀN cho người dùng TRƯỚC khi hộp thoại hệ
 * thống hiện ra. Dùng CHUNG cho mọi tính năng cần vị trí nền (OBD keep-alive,
 * GPS trip) - trước đây mỗi tính năng tự viết 1 bản Alert gần như y hệt nhau
 * (rà soát 25/7: user thấy 2 hộp thoại khác chữ cho cùng 1 quyền, tưởng app
 * đang xin lặp lại). title/body truyền vào để mỗi tính năng vẫn giữ được
 * ngữ cảnh riêng (vd OBD keep-alive cần nhắc thêm bước xin miễn trừ pin theo
 * sau, GPS trip thì không).
 */
export function showBackgroundLocationDisclosure(titleKey: string, bodyKey: string): Promise<boolean> {
  return new Promise((resolve) => {
    const t = useI18nStore.getState().t;
    Alert.alert(
      t(titleKey as any),
      t(bodyKey as any),
      [
        { text: t('gps_trips.disclosure_cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t('gps_trips.disclosure_continue'), onPress: () => resolve(true) },
      ],
      { cancelable: false },
    );
  });
}
