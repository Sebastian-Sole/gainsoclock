import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  findNodeHandle,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { AhaCarouselTiles } from "@/components/onboarding/aha-carousel-tiles";
import { AhaIntakeChip } from "@/components/onboarding/aha-intake-chip";
import { AhaPlanReveal } from "@/components/onboarding/aha-plan-reveal";
import { MedicalDisclaimer } from "@/components/onboarding/medical-disclaimer";
import { api } from "@/convex/_generated/api";
import { capture } from "@/lib/analytics";
import { ERROR_COPY } from "@/lib/copy/errors";
import { parseAhaWorkout, type AhaWorkout } from "@/lib/aha-schema";
import { FALLBACK_SESSION } from "@/lib/onboarding-fallback-session";
import { useAhaSessionStore } from "@/stores/aha-session-store";

const GOAL_LABEL: Record<string, string> = {
  stronger: "Stronger",
  leaner: "Leaner",
  healthier: "Healthier",
  routine: "Routine",
};
const EXPERIENCE_LABEL: Record<string, string> = {
  beginner: "Beginner",
  returning: "Returning",
  experienced: "Experienced",
};
const DAY_SHORT: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

type Status = "streaming" | "complete" | "failed" | "fallback";

function PlanSkeleton() {
  return (
    <View className="gap-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View className="h-6 w-2/3 rounded bg-muted" />
      <View className="h-4 w-1/2 rounded bg-muted" />
      <View className="mt-4 gap-2">
        {[0, 1, 2].map((i) => (
          <View key={i} className="h-16 rounded-xl bg-muted" />
        ))}
      </View>
    </View>
  );
}

export default function OnboardingAhaScreen() {
  const router = useRouter();
  const generationId = useAhaSessionStore((s) => s.generationId);
  const fallbackActive = useAhaSessionStore((s) => s.fallbackActive);
  const rotateGenerationId = useAhaSessionStore((s) => s.rotateGenerationId);
  const rekickAha = useMutation(api.onboarding.rekickAha);

  const aha = useQuery(
    api.onboarding.getAha,
    generationId ? { generationId } : "skip"
  );
  const profile = useQuery(api.onboarding.getProfile);

  const headingRef = useRef<View>(null);
  const retryRef = useRef<View>(null);
  const announcedRef = useRef(false);
  const visibleReportedRef = useRef(false);
  const planVisibleAtRef = useRef<number | null>(null);

  const [parsed, setParsed] = useState<AhaWorkout | null>(null);

  const status: Status = useMemo(() => {
    if (fallbackActive) return "fallback";
    if (!aha) return "streaming";
    if (aha.status === "complete") return "complete";
    if (aha.status === "failed") return "failed";
    return "streaming";
  }, [aha, fallbackActive]);

  const workout: AhaWorkout | null = useMemo(() => {
    if (status === "fallback") return FALLBACK_SESSION;
    if (status === "complete" && aha?.workout !== undefined) {
      return parseAhaWorkout(aha.workout);
    }
    return null;
  }, [status, aha?.workout]);

  useEffect(() => {
    setParsed(workout);
  }, [workout]);

  // Single announcement on complete / fallback.
  useEffect(() => {
    if (announcedRef.current) return;
    if (status !== "complete" && status !== "fallback") return;
    if (!parsed) return;
    announcedRef.current = true;
    const message = `Your first session: ${parsed.workout.name}, ${parsed.workout.durationMinutes} minutes, ${parsed.workout.exercises.length} exercises. Double-tap continue to proceed.`;
    AccessibilityInfo.announceForAccessibility(message);
    const handle = findNodeHandle(headingRef.current);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
    if (!visibleReportedRef.current) {
      visibleReportedRef.current = true;
      planVisibleAtRef.current = Date.now();
      capture({
        name: "plan_visible",
        props: { latencyMs: 0 },
      });
    }
  }, [status, parsed]);

  useEffect(() => {
    if (status !== "failed") return;
    const handle = findNodeHandle(retryRef.current);
    if (handle != null) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
    AccessibilityInfo.announceForAccessibility(ERROR_COPY.AHA_LLM);
  }, [status]);

  const handleContinue = useCallback(() => {
    capture({ name: "plan_continue_tapped", props: {} });
    router.push("/onboarding/paywall" as never);
  }, [router]);

  const handleRetry = useCallback(async () => {
    const id = rotateGenerationId();
    try {
      await rekickAha({ generationId: id });
    } catch {
      // Surfaced via query row next tick.
    }
  }, [rekickAha, rotateGenerationId]);

  // Chip taps navigate to the intake screen; completing the intake cycle
  // routes back through consent → analysis, which rotates a fresh
  // generationId and re-triggers generation. Lifetime cap + 30s debounce are
  // enforced server-side.

  const primaryGoalLabel = profile?.primaryGoal
    ? (GOAL_LABEL[profile.primaryGoal] ?? profile.primaryGoal)
    : "—";
  const experienceLabel = profile?.experience
    ? (EXPERIENCE_LABEL[profile.experience] ?? profile.experience)
    : "—";
  const daysLabel = profile?.trainingDaysOfWeek?.length
    ? profile.trainingDaysOfWeek
        .slice()
        .sort((a, b) => a - b)
        .map((d) => DAY_SHORT[d] ?? "?")
        .join(", ")
    : "—";

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="px-6 pb-10 pt-4"
      accessibilityElementsHidden={status === "streaming"}
    >
      {status === "streaming" ? (
        <View className="gap-4">
          <Text className="text-sm text-muted-foreground">
            Writing your session…
          </Text>
          <PlanSkeleton />
        </View>
      ) : null}

      {(status === "complete" || status === "fallback") && parsed ? (
        <View className="gap-4">
          <AhaPlanReveal ref={headingRef} workout={parsed} />

          {profile ? (
            <AhaCarouselTiles
              profile={{
                weightKg: profile.weightKg,
                heightCm: profile.heightCm,
                ageYears: profile.ageYears,
                biologicalSex: profile.biologicalSex,
                trainingDaysOfWeek: profile.trainingDaysOfWeek,
              }}
              planSummary={parsed.intro}
            />
          ) : null}

          <View className="mt-4 flex-row flex-wrap gap-2">
            <AhaIntakeChip
              label="Goal"
              value={primaryGoalLabel}
              editPath={"/onboarding/goal" as Href}
              onBeforeEdit={() => rotateGenerationId()}
              testID="aha-chip-goal"
            />
            <AhaIntakeChip
              label="Experience"
              value={experienceLabel}
              editPath={"/onboarding/experience" as Href}
              onBeforeEdit={() => rotateGenerationId()}
              testID="aha-chip-experience"
            />
            <AhaIntakeChip
              label="Days"
              value={daysLabel}
              editPath={"/onboarding/days" as Href}
              onBeforeEdit={() => rotateGenerationId()}
              testID="aha-chip-days"
            />
            <AhaIntakeChip
              label="Stats"
              value={
                profile?.weightKg && profile?.heightCm
                  ? `${profile.weightKg} kg · ${profile.heightCm} cm`
                  : "Add stats"
              }
              editPath={"/onboarding/manual-stats" as Href}
              onBeforeEdit={() => rotateGenerationId()}
              testID="aha-chip-stats"
            />
          </View>

          <MedicalDisclaimer />

          <View className="mt-6">
            <Button
              size="onboarding"
              onPress={handleContinue}
              accessibilityRole="button"
              accessibilityLabel="Continue to paywall"
              testID="onboarding-aha-continue"
            >
              <Text>Continue</Text>
            </Button>
          </View>
        </View>
      ) : null}

      {status === "failed" ? (
        <View
          ref={retryRef}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="mt-6 gap-3 rounded-xl border border-destructive bg-destructive/10 px-4 py-3"
        >
          <Text className="text-sm text-destructive">
            {aha?.error === "ai_coach_inference_consent_missing"
              ? "AI personalisation is off. Enable it in Settings to generate your plan."
              : ERROR_COPY.AHA_LLM}
          </Text>
          {aha?.error === "ai_coach_inference_consent_missing" ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open Settings to enable AI personalisation"
              onPress={() => router.push("/settings" as never)}
              hitSlop={10}
              testID="aha-consent-settings-link"
            >
              <Text className="text-sm font-medium text-primary underline">
                Open Settings
              </Text>
            </Pressable>
          ) : (
            <Button
              size="onboarding"
              variant="outline"
              onPress={handleRetry}
              accessibilityRole="button"
              accessibilityLabel="Retry generating your session"
              testID="onboarding-aha-retry"
            >
              <Text>Try again</Text>
            </Button>
          )}
        </View>
      ) : null}

      {status === "complete" && !parsed ? (
        <View className="mt-8 items-center">
          <ActivityIndicator />
          <Text className="mt-2 text-sm text-muted-foreground">
            Formatting your session…
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
