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
    mutationFn: ({ id, odo, date }: { id: number; odo?: number; date?: string }) =>
      remindersApi.done(id, (odo || date)
        ? { last_done_odo: odo, last_done_date: date }
        : undefined).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useSeedReminders = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: number) => remindersApi.seedDefaults(vehicleId).then(r => r.data),
    onSuccess: (_d, vehicleId) => {
      qc.invalidateQueries({ queryKey: ['reminders', vehicleId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useConfirmAllReminders = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vehicleId: number) => remindersApi.confirmAll(vehicleId).then(r => r.data),
    onSuccess: (_d, vehicleId) => {
      qc.invalidateQueries({ queryKey: ['reminders', vehicleId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};
