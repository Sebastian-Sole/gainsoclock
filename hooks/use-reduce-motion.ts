import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Mirrors the user's "Reduce Motion" system setting. Animated components in
 * onboarding (plans 05/07/08) consume this hook to short-circuit non-essential
 * motion — meets Mobile-A11y #6 from the master plan.
 */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setEnabled(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        if (mounted) setEnabled(value);
      }
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return enabled;
}
