import { useNetworkStore } from '@/stores/network-store';

export function useNetwork() {
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);

  return {
    isConnected,
    isInternetReachable,
    /** True when we know for certain the device is offline (or unreachable) */
    isOffline: isConnected === false || isInternetReachable === false,
    /** True while we haven't determined network state yet */
    isUnknown: isConnected === null && isInternetReachable === null,
  };
}
