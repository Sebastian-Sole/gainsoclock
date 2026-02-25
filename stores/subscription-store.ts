import { create } from "zustand";
import { persist } from "zustand/middleware";
import { zustandStorage } from "@/lib/storage";

interface SubscriptionState {
  isPro: boolean;
  productId: string | null;
  expiresAt: string | null;

  setSubscription: (data: {
    isPro: boolean;
    productId?: string | null;
    expiresAt?: string | null;
  }) => void;
  hydrateFromServer: (serverData: {
    isActive: boolean;
    productId?: string | null;
    expiresAt?: string | null;
  }) => void;
  reset: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set) => ({
      isPro: false,
      productId: null,
      expiresAt: null,

      setSubscription: (data) => {
        set({
          isPro: data.isPro,
          productId: data.productId ?? null,
          expiresAt: data.expiresAt ?? null,
        });
      },

      hydrateFromServer: (serverData) => {
        set({
          isPro: serverData.isActive,
          productId: serverData.productId ?? null,
          expiresAt: serverData.expiresAt ?? null,
        });
      },

      reset: () => {
        set({
          isPro: false,
          productId: null,
          expiresAt: null,
        });
      },
    }),
    {
      name: "subscription-storage",
      storage: zustandStorage,
    }
  )
);
