import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { obdApi } from '../api/obd';
import { bleService, ConnectionState, ObdDevice } from '../services/obd/BleService';
import { initializeElm327, readSnapshot, ObdSnapshot } from '../services/obd/ObdReader';
import { TripSession, TripSummary } from '../services/obd/TripSession';
import { enqueueTripSync, flushPendingTrips } from '../services/obd/TripSyncQueue';

// ---- Data queries ----

export const useObdTrips = (vehicleId: number) =>
  useQuery({
    queryKey: ['obd', 'trips', vehicleId],
    queryFn: () => obdApi.trips(vehicleId).then((r) => r.data),
    enabled: !!vehicleId,
  });

export const useObdDtcEvents = (vehicleId: number) =>
  useQuery({
    queryKey: ['obd', 'dtc', vehicleId],
    queryFn: () => obdApi.dtcEvents(vehicleId).then((r) => r.data),
    enabled: !!vehicleId,
  });

export const useResolveDtc = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dtcEventId: number) => obdApi.resolveDtc(dtcEventId).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['obd', 'dtc'] }),
  });
};

// ---- BLE connection + trip management ----

export function useObdConnection(vehicleId: number) {
  const qc = useQueryClient();

  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [foundDevices, setFoundDevices] = useState<ObdDevice[]>([]);
  const [liveSnapshot, setLiveSnapshot] = useState<ObdSnapshot | null>(null);
  const [currentTrip, setCurrentTrip] = useState<TripSession | null>(null);
  const [lastTripSummary, setLastTripSummary] = useState<TripSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stopScanRef = useRef<(() => void) | null>(null);

  const startScan = useCallback(async () => {
    setFoundDevices([]);
    setErrorMessage(null);

    const granted = await bleService.requestPermissions();
    if (!granted) {
      setErrorMessage('Can khong co quyen Bluetooth');
      return;
    }

    setConnectionState('scanning');

    try {
      await bleService.waitForBleReady();
    } catch (e: any) {
      setConnectionState('error');
      setErrorMessage(e.message);
      return;
    }

    stopScanRef.current = bleService.scanForDevices(
      (device) => setFoundDevices((prev) => {
        if (prev.some((d) => d.id === device.id)) return prev;
        return [...prev, device];
      }),
      (error) => {
        setConnectionState('error');
        setErrorMessage(error.message);
      }
    );

    // Auto stop scan after 15s
    setTimeout(() => {
      stopScanRef.current?.();
      setConnectionState((s) => (s === 'scanning' ? 'disconnected' : s));
    }, 15000);
  }, []);

  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    bleService.stopScan();
    setConnectionState('disconnected');
  }, []);

  const connect = useCallback(async (deviceId: string) => {
    stopScan();
    setConnectionState('connecting');
    setErrorMessage(null);

    try {
      await bleService.connect(deviceId);
      const ok = await initializeElm327();
      if (!ok) throw new Error('Khong the khoi tao ELM327');

      setConnectionState('connected');

      // Read first snapshot immediately
      const snap = await readSnapshot();
      setLiveSnapshot(snap);
    } catch (e: any) {
      setConnectionState('error');
      setErrorMessage(e.message);
    }
  }, [stopScan]);

  const disconnect = useCallback(async () => {
    currentTrip?.stop();
    setCurrentTrip(null);
    await bleService.disconnect();
    setConnectionState('disconnected');
    setLiveSnapshot(null);
  }, [currentTrip]);

  const startTrip = useCallback(() => {
    if (!bleService.isConnected() || currentTrip) return;

    const session = new TripSession(vehicleId);

    session.onSnapshot = (snap) => setLiveSnapshot(snap);

    session.onDtcFound = (codes) => {
      // Invalidate DTC list so UI updates automatically
      qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
    };

    session.onTripEnd = async (summary) => {
      setLastTripSummary(summary);
      setCurrentTrip(null);

      const deviceId = bleService.getDeviceId();

      // Try immediate sync; if fails, enqueue for retry on next app open
      try {
        await obdApi.saveTrip(summary, deviceId);
        qc.invalidateQueries({ queryKey: ['obd', 'trips', vehicleId] });
        qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      } catch {
        await enqueueTripSync(summary, deviceId);
      }
    };

    session.start();
    setCurrentTrip(session);
  }, [vehicleId, currentTrip, qc]);

  const stopTrip = useCallback(() => {
    currentTrip?.stop();
  }, [currentTrip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanRef.current?.();
    };
  }, []);

  return {
    connectionState,
    foundDevices,
    liveSnapshot,
    currentTrip,
    lastTripSummary,
    errorMessage,
    isConnected: connectionState === 'connected',
    isTripActive: currentTrip !== null,
    startScan,
    stopScan,
    connect,
    disconnect,
    startTrip,
    stopTrip,
  };
}
