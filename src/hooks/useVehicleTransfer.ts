import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehicleTransferApi } from '../api/vehicleTransfer';

// VIN #30 "Hộ chiếu bảo dưỡng khi sang tên xe" (Premium).

export const useIncomingTransferRequests = () =>
  useQuery({
    queryKey: ['transfer-requests', 'incoming'],
    queryFn: () => vehicleTransferApi.incoming().then((r) => r.data.data),
  });

export const useOutgoingTransferRequests = () =>
  useQuery({
    queryKey: ['transfer-requests', 'outgoing'],
    queryFn: () => vehicleTransferApi.outgoing().then((r) => r.data.data),
  });

export const useSendTransferRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: number) => vehicleTransferApi.sendRequest(vehicleId).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-requests'] }),
  });
};

export const useRespondTransferRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: number; approve: boolean }) =>
      (approve ? vehicleTransferApi.approve(id) : vehicleTransferApi.deny(id)).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfer-requests'] }),
  });
};

export const useSharedHistory = (vehicleId: number, enabled: boolean) =>
  useQuery({
    queryKey: ['vehicle-shared-history', vehicleId],
    queryFn: () => vehicleTransferApi.sharedHistory(vehicleId).then((r) => r.data.data),
    enabled,
  });

export const useMarkVehicleSold = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, sold }: { vehicleId: number; sold: boolean }) =>
      vehicleTransferApi.markSold(vehicleId, sold).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
