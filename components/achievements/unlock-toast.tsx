import { useRouter } from 'expo-router';
import { CircleAlert, Trophy } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { successHaptic, warningHaptic } from '@/lib/haptics';
import { useUnlockToastStore } from '@/stores/unlock-toast-store';

const TOAST_DURATION_MS = 3500;

interface ToastItem {
  id: string;
  /** Display text (may contain the celebration emoji). */
  message: string;
  /** Plain-text screen-reader announcement (no emoji). */
  announcement: string;
  kind: 'unlock' | 'error';
}

type ToastListener = (item: ToastItem) => void;
const toastListeners = new Set<ToastListener>();
let toastCounter = 0;

/**
 * Imperative one-off toast (e.g. share failures). Rendered by
 * {@link UnlockToastHost}, which is mounted once in `app/_layout.tsx` next to
 * the global `PortalHost`. No-op if the host isn't mounted yet.
 */
export function showToast(message: string) {
  toastCounter += 1;
  const item: ToastItem = {
    id: `toast-${toastCounter}`,
    message,
    announcement: message,
    kind: 'error',
  };
  for (const listener of toastListeners) listener(item);
}

/**
 * Global, non-blocking toast banner. Watches the session-scoped unlock feed
 * in `stores/unlock-toast-store.ts` (populated by the standalone
 * `lib/achievement-engine.ts`, not by a hook mounted here) and shows a
 * "🏆 Achievement unlocked" banner for each new unlock, ~3.5s apiece, queued
 * sequentially. Also drains the imperative {@link showToast} queue. Mounted
 * once at the root so it overlays the tab navigator.
 *
 * Known limitation: like everything in the root JS hierarchy (including the
 * PortalHost), it cannot overlay natively-presented modals on iOS.
 */
export function UnlockToastHost() {
  const feed = useUnlockToastStore((s) => s.feed);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const enqueuedKeysRef = useRef(new Set<string>());

  // Enqueue achievement unlocks once per key per session.
  useEffect(() => {
    const fresh = feed.filter((def) => !enqueuedKeysRef.current.has(def.key));
    if (fresh.length === 0) return;
    for (const def of fresh) enqueuedKeysRef.current.add(def.key);
    setQueue((q) => [
      ...q,
      ...fresh.map(
        (def): ToastItem => ({
          id: `unlock-${def.key}`,
          message: `🏆 Achievement unlocked: ${def.title}`,
          announcement: `Achievement unlocked: ${def.title}`,
          kind: 'unlock',
        })
      ),
    ]);
  }, [feed]);

  // Drain the imperative showToast() channel.
  useEffect(() => {
    const listener: ToastListener = (item) => setQueue((q) => [...q, item]);
    toastListeners.add(listener);
    return () => {
      toastListeners.delete(listener);
    };
  }, []);

  const current = queue.length > 0 ? queue[0] : null;

  // Haptic + screen-reader announcement + auto-dismiss for the visible toast.
  useEffect(() => {
    if (!current) return;
    if (current.kind === 'unlock') successHaptic();
    else warningHaptic();
    AccessibilityInfo.announceForAccessibility(current.announcement);
    const timer = setTimeout(() => setQueue((q) => q.slice(1)), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  const isUnlock = current.kind === 'unlock';
  const dismiss = () => setQueue((q) => q.slice(1));
  const handlePress = () => {
    dismiss();
    // Unlock toasts deep-link into the trophy room; error toasts just dismiss.
    if (isUnlock) router.push('/achievements');
  };

  return (
    // box-none: empty area around the toast stays tap-through; the toast itself
    // receives touches.
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, top: insets.top + 8 }}
      className="items-center px-4"
    >
      <Animated.View
        key={current.id}
        entering={reduceMotion ? undefined : FadeInUp.duration(250)}
        exiting={reduceMotion ? undefined : FadeOutUp.duration(200)}
        className="w-full max-w-md"
      >
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={current.announcement}
          accessibilityHint={isUnlock ? 'Opens your achievements' : 'Dismiss'}
          accessibilityLiveRegion="polite"
          testID="achievement-unlock-toast"
          className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg shadow-black/20 active:opacity-80"
        >
          <Icon
            as={isUnlock ? Trophy : CircleAlert}
            size={18}
            className={isUnlock ? 'text-primary' : 'text-destructive'}
          />
          <Text className="flex-1 text-sm font-medium" numberOfLines={2}>
            {current.message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
