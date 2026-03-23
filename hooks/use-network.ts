import { useNetworkStore } from '@/stores/network-store';

export function useNetwork() {
  const isConnected = useNetworkStore((s) => s.isConnected);
  const isInternetReachable = useNetworkStore((s) => s.isInternetReachable);

  return {
    isConnected,
    isInternetReachable,
    /** True when we know for certain the device is offline */
    isOffline: isConnected === false,
    /** True while we haven't determined network state yet */
    isUnknown: isConnected === null,
  };
}
