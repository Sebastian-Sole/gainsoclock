import { create } from 'zustand';

interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  /** Convex WebSocket state, published by lib/convex-sync's connection-state
   *  subscription. null = no client registered yet / state unknown. */
  socketConnected: boolean | null;

  setStatus: (connected: boolean | null, reachable: boolean | null) => void;
  setSocketConnected: (connected: boolean | null) => void;
}

/**
 * The single "are we offline" rule, shared by UI gating (hooks/use-network)
 * and the sync queue (lib/convex-sync). A live Convex socket overrides
 * NetInfo: the simulator (and some real networks) report
 * isInternetReachable=false while the socket is healthy.
 */
export function deriveIsOffline(
  socketConnected: boolean | null,
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
): boolean {
  return (
    socketConnected !== true &&
    (isConnected === false || isInternetReachable === false)
  );
}

export const useNetworkStore = create<NetworkState>()((set) => ({
  isConnected: null,
  isInternetReachable: null,
  socketConnected: null,

  setStatus: (connected, reachable) => {
    set({ isConnected: connected, isInternetReachable: reachable });
  },

  setSocketConnected: (connected) => {
    set({ socketConnected: connected });
  },
}));
