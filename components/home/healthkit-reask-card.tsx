import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { X } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { api } from '@/convex/_generated/api';
import { useHealthKit } from '@/hooks/use-healthkit';
import { capture } from '@/lib/analytics';
import { HEALTHKIT_READ_SCOPES } from '@/lib/healthkit';
import { useIntakeDraftStore } from '@/stores/intake-draft-store';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 2;

// HealthKit-Privacy C2 re-ask cadence. Suppressed for 30 days after one
// dismissal; permanently hidden after two. `sharingDenied` routes to system
// Settings because `requestAuthorization()` is a no-op once Apple marks us
// denied.
export function HealthKitReaskCard(): React.JSX.Element | null {
  const profile = useQuery(api.onboarding.getProfile);
  const reaskState = useIntakeDraftStore((s) => s.reaskState);
  const markReaskDismissed = useIntakeDraftStore((s) => s.markReaskDismissed);
  const {
    isAvailable,
    enable,
    getAuthorizationStatus,
    getLatestStats,
  } = useHealthKit();
  const updateHealthStats = useMutation(api.onboarding.updateHealthStats);

  const [pending, setPending] = useState(false);
  const shownRef = useRef(false);

  const hasWorkout = useQuery(api.workoutLogs.hasAnyLog);
  // Spec (plan-06 §160-169): manual data source AND ≥1 logged workout.
  // `hasWorkout === true` renders false while loading — "false under
  // uncertainty" per the spec.
  const eligibleByProfile =
    profile?.dataSource === 'manual' && hasWorkout === true;
  const dismissedRecently =
    reaskState.lastDismissedAt != null &&
    Date.now() - Date.parse(reaskState.lastDismissedAt) < THIRTY_DAYS_MS;
  const permanentlyHidden = reaskState.dismissCount >= MAX_DISMISSALS;

  const shouldRender =
    isAvailable && eligibleByProfile && !dismissedRecently && !permanentlyHidden;

  useEffect(() => {
    if (!shouldRender || shownRef.current) return;
    shownRef.current = true;
    capture({ name: 'healthkit_reask_shown', props: {} });
  }, [shouldRender]);

  const handleDismiss = useCallback(() => {
    markReaskDismissed();
    capture({ name: 'healthkit_reask_dismissed', props: {} });
  }, [markReaskDismissed]);

  const handleGrant = useCallback(async () => {
    if (pending) return;
    setPending(true);
    try {
      const status = await getAuthorizationStatus();
      if (status === 'sharingDenied') {
        await Linking.openSettings();
        return;
      }

      await enable();
      const afterStatus = await getAuthorizationStatus();
      if (afterStatus === 'sharingDenied') {
        await Linking.openSettings();
        return;
      }

      const stats = await getLatestStats();
      const hasAny =
        stats.weightKg != null ||
        stats.heightCm != null ||
        stats.bodyFatPercent != null;
      if (!hasAny) return;

      await updateHealthStats({
        weightKg: stats.weightKg ?? undefined,
        heightCm: stats.heightCm ?? undefined,
        bodyFatPercent: stats.bodyFatPercent ?? undefined,
        dataSource: 'mixed',
      });
      capture({
        name: 'healthkit_reask_granted',
        props: {},
      });
      // Analytics parity with primer: scope names fire too, never values.
      capture({
        name: 'healthkit_granted',
        props: { grantedScopes: [...HEALTHKIT_READ_SCOPES] },
      });
    } catch (error) {
      console.warn('[healthkit-reask] grant failed', error);
    } finally {
      setPending(false);
    }
  }, [
    enable,
    getAuthorizationStatus,
    getLatestStats,
    pending,
    updateHealthStats,
  ]);

  if (!shouldRender) return null;

  return (
    <View
      className="gap-3 rounded-2xl border border-border bg-card p-4"
      testID="healthkit-reask-card"
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-base font-semibold">
            Import from Apple Health?
          </Text>
          <Text className="mt-1 text-sm text-muted-foreground">
            Sync your weight, height, and body-fat in a tap. We still don&apos;t
            read sleep, heart rate, or workout history.
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Apple Health import"
          hitSlop={10}
          className="h-10 w-10 items-center justify-center rounded-full"
          testID="healthkit-reask-dismiss"
        >
          <Icon as={X} size={18} className="text-muted-foreground" />
        </Pressable>
      </View>
      <Button
        size="onboarding"
        onPress={handleGrant}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel="Import from Apple Health"
        testID="healthkit-reask-grant"
      >
        {pending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text>Import from Apple Health</Text>
        )}
      </Button>
    </View>
  );
}
