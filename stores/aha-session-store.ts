import { create } from "zustand";
import { newGenerationId } from "@/lib/id";

// In-memory store (not persisted) for the current aha generation. Scoped to a
// single onboarding session: cleared when the user lands back on the tabs, or
// when a new generation is rotated in.

type AhaSessionState = {
  generationId: string | null;
  fallbackActive: boolean;
  ensureGenerationId: () => string;
  rotateGenerationId: () => string;
  activateFallback: () => void;
  clear: () => void;
};

export const useAhaSessionStore = create<AhaSessionState>((set, get) => ({
  generationId: null,
  fallbackActive: false,
  ensureGenerationId: () => {
    const current = get().generationId;
    if (current) return current;
    const id = newGenerationId();
    set({ generationId: id, fallbackActive: false });
    return id;
  },
  rotateGenerationId: () => {
    const id = newGenerationId();
    set({ generationId: id, fallbackActive: false });
    return id;
  },
  activateFallback: () => {
    set({ fallbackActive: true });
  },
  clear: () => {
    set({ generationId: null, fallbackActive: false });
  },
}));
