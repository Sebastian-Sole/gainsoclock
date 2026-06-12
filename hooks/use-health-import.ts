import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useConvexAuth, useMutation } from 'convex/react';

import { api } from '@/convex/_generated/api';
import { useNetwork } from '@/hooks/use-network';
import {
  isHealthKitAvailable,
  queryDailyMetrics,
  queryExternalWorkouts,
} from '@/lib/healthkit';
import { useSettingsStore } from '@/stores/settings-store';

/** Don't auto-sync more often than this (manual `syncNow` bypasses it). */
const SYNC_THROTTLE_MS = 15 * 60 * 1000;
/** First sync pulls this far back. */
const FIRST_SYNC_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;
/** Subsequent syncs re-read this much overlap to catch late-arriving samples. */
const RESYNC_OVERLAP_MS = 24 * 60 * 60 * 1000;
/** Batch caps enforced by api.healthData.* mutations. */
const WORKOUT_BATCH_SIZE = 200;
const METRICS_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// Module-level lock so multiple hook instances (root mount + settings screen)
// never run overlapping syncs.
let syncInFlight = false;

/**
 * Imports Apple Health data (external workouts + daily metrics) into Convex.
 * Mount once at root level; runs on mount and on app foreground, throttled to
 * once per 15 minutes. The settings screen can also mount it for `syncNow` /
 * `isSyncing`.
 */
export function useHealthImport() {
  const healthKitEnabled = useSettingsStore((s) => s.healthKitEnabled);
  const healthImportEnabled = useSettingsStore((s) => s.healthImportEnabled);
  const lastSyncAt = useSettingsStore((s) => s.healthImportLastSyncAt);
  const { isAuthenticated } = useConvexAuth();
  const { isOffline } = useNetwork();

  const upsertExternalWorkouts = useMutation(
    api.healthData.upsertExternalWorkouts
  );
  const upsertDailyMetrics = useMutation(api.healthData.upsertDailyMetrics);

  const [isSyncing, setIsSyncing] = useState(false);

  const canSync =
    Platform.OS === 'ios' &&
    isHealthKitAvailable() &&
    healthKitEnabled &&
    healthImportEnabled &&
    isAuthenticated &&
    !isOffline;

  // Keep the latest gate in a ref so the AppState listener doesn't need to
  // re-subscribe on every network/auth flicker.
  const canSyncRef = useRef(canSync);
  useEffect(() => {
    canSyncRef.current = canSync;
  }, [canSync]);

  /**
   * Run a sync immediately (no throttle). Returns true when data was synced
   * and the last-sync timestamp advanced. On failure the timestamp is left
   * unchanged so the next foreground retries the same window.
   */
  const syncNow = useCallback(async (): Promise<boolean> => {
    if (!canSyncRef.current) return false;
    if (syncInFlight) return false;
    syncInFlight = true;
    setIsSyncing(true);
    try {
      const now = Date.now();
      const lastSync = useSettingsStore.getState().healthImportLastSyncAt;
      const from = new Date(
        lastSync == null ? now - FIRST_SYNC_LOOKBACK_MS : lastSync - RESYNC_OVERLAP_MS
      );
      const to = new Date(now);

      const [workouts, metrics] = await Promise.all([
        queryExternalWorkouts(from, to),
        queryDailyMetrics(from, to),
      ]);

      for (const batch of chunk(workouts, WORKOUT_BATCH_SIZE)) {
        await upsertExternalWorkouts({ workouts: batch });
      }
      for (const batch of chunk(metrics, METRICS_BATCH_SIZE)) {
        await upsertDailyMetrics({ metrics: batch });
      }

      useSettingsStore.getState().setHealthImportLastSyncAt(now);
      return true;
    } catch (error) {
      // Leave healthImportLastSyncAt unchanged — next foreground retries.
      console.warn('[HealthImport] Sync failed:', error);
      return false;
    } finally {
      syncInFlight = false;
      setIsSyncing(false);
    }
  }, [upsertDailyMetrics, upsertExternalWorkouts]);

  // Auto-sync on mount and on app foreground, throttled.
  useEffect(() => {
    if (!canSync) return;

    const maybeSync = () => {
      if (!canSyncRef.current) return;
      const last = useSettingsStore.getState().healthImportLastSyncAt;
      if (last != null && Date.now() - last < SYNC_THROTTLE_MS) return;
      void syncNow();
    };

    maybeSync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeSync();
    });
    return () => subscription.remove();
  }, [canSync, syncNow]);

  return { isSyncing, lastSyncAt, syncNow };
}
