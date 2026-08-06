import { create } from 'zustand';

// Trạng thái mạng TOÀN CỤC (rà soát 6/8, góp ý user: mất mạng/có mạng lại
// không có phản hồi gì để user biết) - networkStatusListener.ts ghi mỗi lần
// đổi trạng thái, NetworkStatusToast.tsx đọc để hiện toast ĐÚNG LÚC CHUYỂN
// (không phải hiện liên tục 1 pill trạng thái - mạng chập chờn sẽ nhấp nháy).
type NetworkStatusState = {
  isOnline: boolean;
  patch: (p: Partial<Omit<NetworkStatusState, 'patch'>>) => void;
};

export const useNetworkStatusStore = create<NetworkStatusState>((set) => ({
  isOnline: true,
  patch: (p) => set(p),
}));
