import { AppState, type AppStateStatus } from "react-native";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { zustandStorage } from "@/lib/storage";
import { newClientId } from "@/lib/id";

export type Goal = "stronger" | "leaner" | "healthier" | "routine";
export type Experience = "beginner" | "returning" | "experienced";
export type BiologicalSex = "male" | "female";
export type DataSource = "healthkit" | "manual" | "mixed";

export type ReaskState = {
  lastDismissedAt: string | null;
  dismissCount: number;
};

const INITIAL_REASK_STATE: ReaskState = {
  lastDismissedAt: null,
  dismissCount: 0,
};

// Non-Art. 9 (persisted): decisions a returning user can resume without
// re-answering.
export type NonSpecialDraft = {
  goals?: Goal[];
  primaryGoal?: Goal;
  experience?: Experience;
  trainingDaysOfWeek?: number[];
  // `dataSource` is provenance metadata — not a body value. Safe to persist.
  dataSource?: DataSource;
  // HealthKit re-ask cadence bookkeeping (HealthKit-Privacy C2). Not Art. 9.
  reaskState: ReaskState;
};

// Art. 9 / health data — MUST NEVER be persisted (Theme D / Security CR2).
// If a future reviewer asks to add these to `partialize` for resume UX, stop.
export type SpecialDraft = {
  ageYears?: number;
  biologicalSex?: BiologicalSex;
  weightKg?: number;
  heightCm?: number;
  bodyFatPercent?: number;
};

export type DraftState = NonSpecialDraft &
  SpecialDraft & {
    clientIntakeId: string;
    userIdPartition?: string;
    lastTouchedAt?: string;
  };

type DraftActions = {
  setDraftField: <K extends keyof DraftState>(
    key: K,
    value: DraftState[K]
  ) => void;
  clearDraft: () => void;
  ensureUserPartition: (userId: string) => void;
  flushPendingPersist: () => void;
  markReaskDismissed: () => void;
  resetReaskState: () => void;
};

const DEBOUNCE_MS = 300;
const STALENESS_MS = 7 * 24 * 60 * 60 * 1000;

function freshId(): string {
  return newClientId();
}

function createInitialState(): DraftState {
  return {
    clientIntakeId: freshId(),
    reaskState: { ...INITIAL_REASK_STATE },
  };
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useIntakeDraftStore = create<DraftState & DraftActions>()(
  persist(
    (set, get) => ({
      ...createInitialState(),
      setDraftField: (key, value) => {
        set((state) => ({
          ...state,
          [key]: value,
          lastTouchedAt: new Date().toISOString(),
        }));
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          flushTimer = null;
          // Zustand persist middleware writes on each `set`; the debounce is
          // a soft intent. We call `rehydrate`-adjacent no-op here to keep
          // the API consistent with AppState flushes below.
          void get();
        }, DEBOUNCE_MS);
      },
      clearDraft: () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        set(() => ({ ...createInitialState() }));
      },
      ensureUserPartition: (userId) => {
        const current = get();
        if (current.userIdPartition && current.userIdPartition !== userId) {
          set(() => ({
            ...createInitialState(),
            userIdPartition: userId,
          }));
          return;
        }
        if (!current.userIdPartition) {
          set((state) => ({ ...state, userIdPartition: userId }));
        }
      },
      flushPendingPersist: () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
          // Force a bump so persist middleware writes latest state.
          set((state) => ({ ...state }));
        }
      },
      markReaskDismissed: () => {
        set((state) => ({
          ...state,
          reaskState: {
            lastDismissedAt: new Date().toISOString(),
            dismissCount: (state.reaskState?.dismissCount ?? 0) + 1,
          },
        }));
      },
      resetReaskState: () => {
        set((state) => ({
          ...state,
          reaskState: { ...INITIAL_REASK_STATE },
        }));
      },
    }),
    {
      name: "intake-draft-v2",
      storage: zustandStorage,
      // Allowlist: Art. 9 fields are explicitly absent so they never hit disk.
      // `reaskState` and `dataSource` are interaction metadata, not body data.
      partialize: (state) => ({
        goals: state.goals,
        primaryGoal: state.primaryGoal,
        experience: state.experience,
        trainingDaysOfWeek: state.trainingDaysOfWeek,
        dataSource: state.dataSource,
        reaskState: state.reaskState,
        clientIntakeId: state.clientIntakeId,
        userIdPartition: state.userIdPartition,
        lastTouchedAt: state.lastTouchedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Backfill reaskState for users persisted under the pre-plan-06 shape.
        if (!state.reaskState) {
          useIntakeDraftStore.setState((s) => ({
            ...s,
            reaskState: { ...INITIAL_REASK_STATE },
          }));
        }
        const touched = state.lastTouchedAt
          ? Date.parse(state.lastTouchedAt)
          : NaN;
        if (
          Number.isFinite(touched) &&
          Date.now() - touched > STALENESS_MS
        ) {
          useIntakeDraftStore.setState(() => ({ ...createInitialState() }));
        }
      },
    }
  )
);

// Flush on background so an app-kill doesn't drop a recent write.
const handleAppStateChange = (next: AppStateStatus) => {
  if (next === "background" || next === "inactive") {
    useIntakeDraftStore.getState().flushPendingPersist();
  }
};
AppState.addEventListener("change", handleAppStateChange);
