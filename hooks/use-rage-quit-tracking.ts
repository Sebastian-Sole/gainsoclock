import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { capture } from "@/lib/analytics";

const RAGE_QUIT_THRESHOLD_MS = 3000;

/**
 * Fires `rage_quit` if the user backgrounds the app within ~3s of mounting
 * the supplied screen — a strong signal that the screen failed to engage.
 *
 * The hook is forward-only: it instruments the mount → background transition,
 * never the unmount path (per the review-derived rule in plan-03).
 */
export function useRageQuitTracking(screen: string): void {
  const mountedAt = useRef(Date.now());

  useEffect(() => {
    mountedAt.current = Date.now();
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "background") return;
      const dt = Date.now() - mountedAt.current;
      if (dt < RAGE_QUIT_THRESHOLD_MS) {
        capture({ name: "rage_quit", props: { screen, msSinceMount: dt } });
      }
    });
    return () => sub.remove();
  }, [screen]);
}
