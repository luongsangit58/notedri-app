import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { obdApi } from '../api/obd';
import { bleService, ConnectionState, ObdDevice } from '../services/obd/BleService';
import { initializeElm327, readSnapshot, ObdSnapshot } from '../services/obd/ObdReader';
import { TripSession, TripSummary } from '../services/obd/TripSession';
import { enqueueTripSync } from '../services/obd/TripSyncQueue';
import { useAuthStore } from '../store/authStore';

// ---- Data queries ----

export const useObdTrips = (vehicleId: number) => {
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  return useQuery({
    queryKey: ['obd', 'trips', vehicleId],
    queryFn: () => obdApi.trips(vehicleId).then((r) => r.data),
    enabled: !!vehicleId && isPremium,
  });
};

export const useObdDtcEvents = (vehicleId: number) => {
  const isPremium = useAuthStore((s) => s.user?.is_premium ?? false);
  return useQuery({
    queryKey: ['obd', 'dtc', vehicleId],
    queryFn: () => obdApi.dtcEvents(vehicleId).then((r) => r.data),
    enabled: !!vehicleId && isPremium,
  });
};

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
  const [lastTripSummary, setLastTripSummary] = useState<TripSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep trip session in a ref (not state) so cleanup effects always see the
  // latest instance without stale closure problems.
  const currentTripRef = useRef<TripSession | null>(null);
  const [isTripActive, setIsTripActive] = useState(false);

  const stopScanRef = useRef<(() => void) | null>(null);
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Helpers ---

  const clearAutoStopTimer = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
  }, []);

  // --- Scan ---

  const startScan = useCallback(async () => {
    // Stop any previous scan before starting a new one to avoid listener leaks
    stopScanRef.current?.();
    bleService.stopScan();
    clearAutoStopTimer();

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

    autoStopTimerRef.current = setTimeout(() => {
      stopScanRef.current?.();
      stopScanRef.current = null;
      setConnectionState((s) => (s === 'scanning' ? 'disconnected' : s));
    }, 15000);
  }, [clearAutoStopTimer]);

  const stopScan = useCallback(() => {
    clearAutoStopTimer();
    stopScanRef.current?.();
    stopScanRef.current = null;
    bleService.stopScan();
    setConnectionState('disconnected');
  }, [clearAutoStopTimer]);

  // --- Connect ---

  const connect = useCallback(async (deviceId: string) => {
    stopScan();
    setConnectionState('connecting');
    setErrorMessage(null);

    // Register disconnect callback before connecting
    bleService.onDisconnect = () => {
      // Finalize any in-progress trip so data is not lost
      if (currentTripRef.current) {
        currentTripRef.current.stop();
        currentTripRef.current = null;
        setIsTripActive(false);
      }
      setConnectionState('disconnected');
      setLiveSnapshot(null);
    };

    try {
      await bleService.connect(deviceId);
      const ok = await initializeElm327();
      if (!ok) throw new Error('Khong the khoi tao ELM327');

      setConnectionState('connected');

      const snap = await readSnapshot();
      setLiveSnapshot(snap);
    } catch (e: any) {
      bleService.onDisconnect = null;
      setConnectionState('error');
      setErrorMessage(e.message);
    }
  }, [stopScan]);

  const disconnect = useCallback(async () => {
    if (currentTripRef.current) {
      currentTripRef.current.stop();
      currentTripRef.current = null;
      setIsTripActive(false);
    }
    bleService.onDisconnect = null;
    await bleService.disconnect();
    setConnectionState('disconnected');
    setLiveSnapshot(null);
  }, []);

  // --- Trip ---

  const startTrip = useCallback(() => {
    if (!bleService.isConnected() || currentTripRef.current) return;

    const session = new TripSession(vehicleId);

    session.onSnapshot = (snap) => setLiveSnapshot(snap);

    session.onDtcFound = () => {
      qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
    };

    session.onTripEnd = async (summary) => {
      currentTripRef.current = null;
      setIsTripActive(false);
      setLastTripSummary(summary);

      const deviceId = bleService.getDeviceId();
      try {
        await obdApi.saveTrip(summary, deviceId);
        qc.invalidateQueries({ queryKey: ['obd', 'trips', vehicleId] });
        qc.invalidateQueries({ queryKey: ['obd', 'dtc', vehicleId] });
        qc.invalidateQueries({ queryKey: ['dashboard'] });
      } catch {
        // Network offline — enqueue for retry on next app foreground
        await enqueueTripSync(summary, deviceId);
      }
    };

    session.start();
    currentTripRef.current = session;
    setIsTripActive(true);
  }, [vehicleId, qc]);

  const stopTrip = useCallback(() => {
    currentTripRef.current?.stop();
  }, []);

  // Cleanup on unmount: stop scan + finalize any active trip
  useEffect(() => {
    return () => {
      clearAutoStopTimer();
      stopScanRef.current?.();
      // Stop trip (triggers onTripEnd → saves data) rather than discarding
      currentTripRef.current?.stop();
      bleService.onDisconnect = null;
    };
  }, [clearAutoStopTimer]);

  return {
    connectionState,
    foundDevices,
    liveSnapshot,
    currentTripRef,
    lastTripSummary,
    errorMessage,
    isConnected: connectionState === 'connected',
    isTripActive,
    startScan,
    stopScan,
    connect,
    disconnect,
    startTrip,
    stopTrip,
  };
}
