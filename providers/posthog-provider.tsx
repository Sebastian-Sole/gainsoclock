import { useEffect, type ReactNode } from "react";
import { InteractionManager } from "react-native";

import { initPostHog } from "@/lib/analytics";

/**
 * Mounts PostHog after the first batch of interactions has resolved so SDK
 * construction never blocks the cold-start to first-paint window. Children
 * render immediately; `capture()` buffers any events fired before init
 * completes.
 *
 * Mount order is fixed in `app/_layout.tsx`: this provider sits BELOW
 * `NetworkProvider` + `ConvexAuthProvider` + `ConvexSyncProvider`, so the
 * consent gate (which reads from `userConsents`) is wired before PostHog
 * starts capturing.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    if (!apiKey) {
      // Dev-time signal only — analytics is optional for local builds.
      if (__DEV__) {
        console.info(
          "[analytics] EXPO_PUBLIC_POSTHOG_API_KEY not set — PostHog disabled"
        );
      }
      return;
    }
    const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;
    const handle = InteractionManager.runAfterInteractions(() => {
      void initPostHog({ apiKey, ...(host ? { host } : {}) });
    });
    return () => handle.cancel();
  }, []);

  return <>{children}</>;
}
