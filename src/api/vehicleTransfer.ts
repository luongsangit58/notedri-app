import client from './client';

// VIN #30 "Hộ chiếu bảo dưỡng khi sang tên xe" (Premium) - xem
// _bmad-output/maintenance-passport-design-proposal-2026-07-14.md.

export type TransferRequestStatus = 'pending' | 'approved' | 'denied' | 'expired';

export type TransferRequestRecord = {
  id: number;
  vin: string;
  status: TransferRequestStatus;
  requested_at: string;
  responded_at: string | null;
  expires_at: string;
  requester_vehicle_id: number;
  requester_vehicle_name: string | null;
  owner_vehicle_name: string | null;
};

export type SharedHistory = {
  shared_at: string | null;
  service_history: Array<{ ngay: string | null; hang_muc: string; loai: string }>;
  health_trend: Array<{ total: number; band: string; date: string }>;
  dtc_total_count: number;
} | null;

export const vehicleTransferApi = {
  sendRequest: (vehicleId: number) =>
    client.post<{ data: TransferRequestRecord }>(`/vehicles/${vehicleId}/transfer-requests`),

  incoming: () => client.get<{ data: TransferRequestRecord[] }>('/transfer-requests/incoming'),

  outgoing: () => client.get<{ data: TransferRequestRecord[] }>('/transfer-requests/outgoing'),

  approve: (id: number) => client.post<{ data: TransferRequestRecord }>(`/transfer-requests/${id}/approve`),

  deny: (id: number) => client.post<{ data: TransferRequestRecord }>(`/transfer-requests/${id}/deny`),

  sharedHistory: (vehicleId: number) =>
    client.get<{ data: SharedHistory }>(`/vehicles/${vehicleId}/shared-history`),

  markSold: (vehicleId: number, sold: boolean = true) =>
    client.post(`/vehicles/${vehicleId}/sold`, { sold }),
};
