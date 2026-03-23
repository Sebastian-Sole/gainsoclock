import React, { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useNetworkStore } from '@/stores/network-store';
import { flushSyncQueue } from '@/lib/convex-sync';

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const prevOffline = wasOffline.current;

      useNetworkStore.getState().setStatus(
        state.isConnected,
        state.isInternetReachable,
      );

      const isNowOnline = state.isConnected === true;
      wasOffline.current = !isNowOnline;

      // Flush queued mutations when transitioning from offline → online
      if (prevOffline && isNowOnline) {
        void flushSyncQueue();
      }
    });
    return unsubscribe;
  }, []);

  // Also flush on mount in case the app was killed while offline and
  // reopened with connectivity
  useEffect(() => {
    void flushSyncQueue();
  }, []);

  return <>{children}</>;
}
