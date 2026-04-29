import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { Text } from "@/components/ui/text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { capture } from "@/lib/analytics";
import { useIntakeDraftStore } from "@/stores/intake-draft-store";

const STALENESS_MS = 7 * 24 * 60 * 60 * 1000;

type Props = {
  userId: string | null;
  hasCompletedOnboarding: boolean;
};

function lastIntakeStep(draft: {
  goals?: unknown[];
  experience?: unknown;
  trainingDaysOfWeek?: unknown[];
}): "goal" | "experience" | "days" {
  if (draft.trainingDaysOfWeek && draft.trainingDaysOfWeek.length > 0) {
    return "days";
  }
  if (draft.experience) return "experience";
  return "goal";
}

export function AbandonmentRecoveryInterstitial({
  userId,
  hasCompletedOnboarding,
}: Props) {
  const router = useRouter();
  const draft = useIntakeDraftStore();
  const clearDraft = useIntakeDraftStore((s) => s.clearDraft);

  const shouldShow = useMemo(() => {
    if (!userId) return false;
    if (hasCompletedOnboarding) return false;
    if (!draft.userIdPartition || draft.userIdPartition !== userId) return false;
    const hasDraftContent =
      (draft.goals?.length ?? 0) > 0 ||
      draft.experience !== undefined ||
      (draft.trainingDaysOfWeek?.length ?? 0) > 0;
    if (!hasDraftContent) return false;
    const touched = draft.lastTouchedAt
      ? Date.parse(draft.lastTouchedAt)
      : NaN;
    if (!Number.isFinite(touched)) return false;
    if (Date.now() - touched > STALENESS_MS) return false;
    return true;
  }, [
    userId,
    hasCompletedOnboarding,
    draft.userIdPartition,
    draft.goals,
    draft.experience,
    draft.trainingDaysOfWeek,
    draft.lastTouchedAt,
  ]);

  if (!shouldShow) return null;

  const handleContinue = () => {
    capture({ name: "intake_resumed", props: {} });
    const step = lastIntakeStep(draft);
    router.replace(`/onboarding/${step}` as never);
  };

  const handleStartOver = () => {
    capture({ name: "intake_restarted", props: {} });
    clearDraft();
    router.replace("/onboarding/goal" as never);
  };

  return (
    <Dialog open>
      <DialogContent
        accessibilityViewIsModal
        className="gap-4"
      >
        <DialogTitle>Welcome back.</DialogTitle>
        <DialogDescription>Pick up where you left off?</DialogDescription>
        <View className="gap-3 pt-2">
          <Pressable
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue intake from where you left off"
            className="min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-3 active:bg-primary/90"
            testID="abandonment-recovery-continue"
          >
            <Text className="text-base font-semibold text-primary-foreground">
              Continue
            </Text>
          </Pressable>
          <Pressable
            onPress={handleStartOver}
            accessibilityRole="button"
            accessibilityLabel="Start intake over"
            accessibilityHint="Clears your saved draft and restarts intake"
            className="min-h-[44px] items-center justify-center rounded-xl border border-border bg-card px-4 py-3 active:bg-accent"
            testID="abandonment-recovery-restart"
          >
            <Text className="text-base font-medium">Start over</Text>
          </Pressable>
        </View>
      </DialogContent>
    </Dialog>
  );
}
