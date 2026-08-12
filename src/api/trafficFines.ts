import client from './client';

export type TrafficFineRow = {
  id: number;
  loai_xe: 'oto' | 'xe_may';
  nhom: string;
  hanh_vi: string;
  muc_phat_tu: number;
  muc_phat_den: number;
  diem_tru_gplx: number | null;
  can_cu_phap_ly: string;
};

// Backend hỗ trợ filter qua query (loai_xe/nhom/q) nhưng dữ liệu tĩnh, chỉ ~50 dòng - tải 1 lần
// rồi lọc phía client (cùng pattern DtcLookupScreen dùng dictionary offline), tránh round-trip
// server mỗi lần đổi filter/gõ phím.
export const trafficFinesApi = {
  list: () => client.get<{ data: TrafficFineRow[] }>('/traffic-fines'),
};
