import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';
import { syncToConvex } from '@/lib/convex-sync';
import { api } from '@/convex/_generated/api';

export type WeightUnit = 'kg' | 'lbs';
export type DistanceUnit = 'km' | 'mi';

interface SettingsState {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultRestTime: number;
  hapticsEnabled: boolean;
  healthKitEnabled: boolean;

  setWeightUnit: (unit: WeightUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setDefaultRestTime: (seconds: number) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setHealthKitEnabled: (enabled: boolean) => void;
  hydrateFromServer: (serverSettings: { weightUnit: string; distanceUnit: string; defaultRestTime: number; hapticsEnabled: boolean }) => void;
}

function syncSettings(state: SettingsState) {
  syncToConvex(api.settings.upsert, {
    weightUnit: state.weightUnit,
    distanceUnit: state.distanceUnit,
    defaultRestTime: state.defaultRestTime,
    hapticsEnabled: state.hapticsEnabled,
  });
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      weightUnit: 'kg',
      distanceUnit: 'km',
      defaultRestTime: 90,
      hapticsEnabled: true,
      healthKitEnabled: false,

      setWeightUnit: (unit) => {
        set({ weightUnit: unit });
        syncSettings(get());
      },

      setDistanceUnit: (unit) => {
        set({ distanceUnit: unit });
        syncSettings(get());
      },

      setDefaultRestTime: (seconds) => {
        set({ defaultRestTime: seconds });
        syncSettings(get());
      },

      setHapticsEnabled: (enabled) => {
        set({ hapticsEnabled: enabled });
        syncSettings(get());
      },

      setHealthKitEnabled: (enabled) => {
        set({ healthKitEnabled: enabled });
        // Not synced to Convex — Apple Health is a per-device setting
      },

      hydrateFromServer: (serverSettings) => {
        set({
          weightUnit: serverSettings.weightUnit as WeightUnit,
          distanceUnit: serverSettings.distanceUnit as DistanceUnit,
          defaultRestTime: serverSettings.defaultRestTime,
          hapticsEnabled: serverSettings.hapticsEnabled,
        });
      },
    }),
    {
      name: 'settings-storage',
      storage: zustandStorage,
    }
  )
);
