import { create } from "zustand";
import { persist } from "zustand/middleware";
import { zustandStorage } from "@/lib/storage";

export type SubscriptionStatus =
  | "free"
  | "trial"
  | "pro"
  | "grace"
  | "paused"
  | "lapsed";

export type SubscriptionSource =
  | "rc_intro"
  | "rc_paid"
  | "rc_temp"
  | "app_local";

export interface SourceHistoryEntry {
  source: string;
  grantedAt: string;
  reason: string;
}

interface ServerStateSnapshot {
  status?: SubscriptionStatus;
  source?: SubscriptionSource | null;
  productId?: string | null;
  expiresAt?: string | null;
  trialExpiresAt?: string | null;
  willAutoRenew?: boolean;
  cancelReason?: string | null;
  sourceHistory?: SourceHistoryEntry[];
  lastVerifiedAt?: string | null;
  notificationAnchorAt?: string | null;
  emailOptOut?: boolean;
  storefrontCountry?: string | null;
  // Legacy field — older callers send `isActive`. New callers should send
  // `status` instead.
  isActive?: boolean;
}

interface SubscriptionState {
  status: SubscriptionStatus;
  source: SubscriptionSource | null;
  productId: string | null;
  expiresAt: string | null;
  trialExpiresAt: string | null;
  willAutoRenew: boolean;
  cancelReason: string | null;
  sourceHistory: SourceHistoryEntry[];
  lastVerifiedAt: string | null;
  notificationAnchorAt: string | null;
  emailOptOut: boolean;
  storefrontCountry: string | null;

  /**
   * @deprecated Use `status === "pro" | "trial" | "grace"`.
   * Retained as a derived field so legacy callers don't break mid-migration.
   */
  isPro: boolean;

  setSubscription: (data: ServerStateSnapshot) => void;
  hydrateFromServer: (serverData: ServerStateSnapshot) => void;
  reset: () => void;
}

const INITIAL: Omit<
  SubscriptionState,
  "setSubscription" | "hydrateFromServer" | "reset"
> = {
  status: "free",
  source: null,
  productId: null,
  expiresAt: null,
  trialExpiresAt: null,
  willAutoRenew: false,
  cancelReason: null,
  sourceHistory: [],
  lastVerifiedAt: null,
  notificationAnchorAt: null,
  emailOptOut: false,
  storefrontCountry: null,
  isPro: false,
};

function deriveIsPro(status: SubscriptionStatus): boolean {
  return status === "pro" || status === "trial" || status === "grace";
}

function normalize(
  prev: Omit<
    SubscriptionState,
    "setSubscription" | "hydrateFromServer" | "reset"
  >,
  data: ServerStateSnapshot,
): Omit<
  SubscriptionState,
  "setSubscription" | "hydrateFromServer" | "reset"
> {
  // Server `status` wins. Fall back to legacy `isActive` mapping for
  // call sites that haven't migrated yet.
  let status: SubscriptionStatus =
    data.status ??
    (data.isActive === undefined
      ? prev.status
      : data.isActive
        ? "pro"
        : "free");

  return {
    status,
    source: data.source === undefined ? prev.source : data.source,
    productId: data.productId === undefined ? prev.productId : data.productId,
    expiresAt: data.expiresAt === undefined ? prev.expiresAt : data.expiresAt,
    trialExpiresAt:
      data.trialExpiresAt === undefined
        ? prev.trialExpiresAt
        : data.trialExpiresAt,
    willAutoRenew: data.willAutoRenew ?? prev.willAutoRenew,
    cancelReason:
      data.cancelReason === undefined ? prev.cancelReason : data.cancelReason,
    sourceHistory: data.sourceHistory ?? prev.sourceHistory,
    lastVerifiedAt:
      data.lastVerifiedAt === undefined
        ? prev.lastVerifiedAt
        : data.lastVerifiedAt,
    notificationAnchorAt:
      data.notificationAnchorAt === undefined
        ? prev.notificationAnchorAt
        : data.notificationAnchorAt,
    emailOptOut: data.emailOptOut ?? prev.emailOptOut,
    storefrontCountry:
      data.storefrontCountry === undefined
        ? prev.storefrontCountry
        : data.storefrontCountry,
    isPro: deriveIsPro(status),
  };
}

export const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setSubscription: (data) => {
        set(normalize(get(), data));
      },

      hydrateFromServer: (serverData) => {
        set(normalize(get(), serverData));
      },

      reset: () => {
        set(INITIAL);
      },
    }),
    {
      name: "subscription-storage",
      storage: zustandStorage,
    },
  ),
);
