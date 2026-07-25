export interface RadioStation {
  id: string;
  name: string;
  url: string;
}

// Rà soát 24/7 (góp ý user: nghe radio internet thay cho FM thật - đầu Android
// ô tô không có API chuẩn để bất kỳ app thứ 3 nào bắt sóng FM qua phần cứng
// riêng của từng hãng). Danh sách MẶC ĐỊNH ban đầu - link stream công khai
// tổng hợp qua tìm kiếm, CHƯA tự kiểm thử phát thực tế được (môi trường code
// không nghe được audio) - nếu đài nào chết link khi test trên máy thật, xoá/
// sửa thẳng URL ở đây, không cần đổi gì khác trong RadioButton.tsx.
export const RADIO_STATIONS: RadioStation[] = [
  { id: 'vov-giao-thong', name: 'VOV Giao thông', url: 'https://str.vov.gov.vn/vovlive/vovGTHN.sdp_aac/playlist.m3u8' },
  { id: 'vov1', name: 'VOV1 - Thời sự', url: 'https://str.vov.gov.vn/vov1/vov1.sdp_aac/playlist.m3u8' },
  { id: 'vov3', name: 'VOV3 - Âm nhạc', url: 'https://str.vov.gov.vn/vov3/vov3.sdp_aac/playlist.m3u8' },
];
