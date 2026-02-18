import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { zustandStorage } from '@/lib/storage';

export type WeightUnit = 'kg' | 'lbs';
export type DistanceUnit = 'km' | 'mi';

interface SettingsState {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultRestTime: number;
  hapticsEnabled: boolean;
  useLastWorkoutValues: boolean;

  setWeightUnit: (unit: WeightUnit) => void;
  setDistanceUnit: (unit: DistanceUnit) => void;
  setDefaultRestTime: (seconds: number) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setUseLastWorkoutValues: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weightUnit: 'kg',
      distanceUnit: 'km',
      defaultRestTime: 90,
      hapticsEnabled: true,
      useLastWorkoutValues: false,

      setWeightUnit: (unit) => set({ weightUnit: unit }),
      setDistanceUnit: (unit) => set({ distanceUnit: unit }),
      setDefaultRestTime: (seconds) => set({ defaultRestTime: seconds }),
      setHapticsEnabled: (enabled) => set({ hapticsEnabled: enabled }),
      setUseLastWorkoutValues: (enabled) => set({ useLastWorkoutValues: enabled }),
    }),
    {
      name: 'settings-storage',
      storage: zustandStorage,
    }
  )
);
