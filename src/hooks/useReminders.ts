import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { remindersApi } from '../api/reminders';

export const useReminders = (vehicleId: number) =>
  useQuery({
    queryKey: ['reminders', vehicleId],
    queryFn: () => remindersApi.list(vehicleId).then(r => r.data),
    enabled: !!vehicleId,
  });

export const useCreateReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: number; data: any }) =>
      remindersApi.create(vehicleId, data).then(r => r.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['reminders', v.vehicleId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useDeleteReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => remindersApi.delete(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  });
};

export const useDoneReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, odo }: { id: number; odo?: number }) =>
      remindersApi.done(id, odo ? { last_done_odo: odo } : undefined).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
