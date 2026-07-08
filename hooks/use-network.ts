import { deriveIsOffline, useNetworkStore } from '@/stores/network-store';

export function useNetwork() {
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);
  const socketConnected = useNetworkStore((s) => s.socketConnected);

  return {
    isConnected,
    isInternetReachable,
    /** True when we know for certain the device is offline (or unreachable).
     *  Shares its derivation with the sync queue, so UI gating (banner, chat
     *  input, health import) always agrees with whether writes actually sync. */
    isOffline: deriveIsOffline(socketConnected, isConnected, isInternetReachable),
    /** True while we haven't determined network state yet */
    isUnknown: isConnected === null && isInternetReachable === null,
  };
}
