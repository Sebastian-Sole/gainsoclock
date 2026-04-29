import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { useRouter } from "expo-router";
import { useAction, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { NarratedLine } from "@/components/onboarding/narrated-line";
import { api } from "@/convex/_generated/api";
import { capture } from "@/lib/analytics";
import { ERROR_COPY } from "@/lib/copy/errors";
import { useAhaSessionStore } from "@/stores/aha-session-store";

const LINE_INTERVAL_MS = 800;
const P50_MS = 3500;
const P95_MS = 8000;
const P99_MS = 14000;

const BASE_LINES = [
  "Looking at your inputs…",
  "Fitting your sessions into your week…",
  "Writing your first session…",
] as const;

const P50_EXTRA_LINE = "Refining for your training days…";

export default function OnboardingAnalysisScreen() {
  const router = useRouter();
  const rotateGenerationId = useAhaSessionStore((s) => s.rotateGenerationId);
  const activateFallback = useAhaSessionStore((s) => s.activateFallback);
  const generateAhaWorkout = useAction(
    api.onboardingActions.generateAhaWorkout
  );

  const [generationId] = useState(() => rotateGenerationId());
  const aha = useQuery(api.onboarding.getAha, { generationId });
  const kickoffRef = useRef<number>(Date.now());
  const routedRef = useRef(false);
  const firstByteReportedRef = useRef(false);

  const [voiceOver, setVoiceOver] = useState(false);
  const [linesVisible, setLinesVisible] = useState(voiceOver ? 3 : 0);
  const [showExtraLine, setShowExtraLine] = useState(false);
  const [showRetry, setShowRetry] = useState(false);

  // Detect VoiceOver before mount to decide animation vs immediate render.
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (!mounted) return;
      setVoiceOver(enabled);
      if (enabled) {
        setLinesVisible(3);
        AccessibilityInfo.announceForAccessibility(
          "Generating your first session. This takes a few seconds."
        );
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Kick off the action exactly once per mount.
  const kickedRef = useRef(false);
  useEffect(() => {
    if (kickedRef.current) return;
    kickedRef.current = true;
    kickoffRef.current = Date.now();
    capture({ name: "plan_generation_started", props: {} });
    generateAhaWorkout({ generationId }).catch(() => {
      // Server-side failure is surfaced through the query row; this catch is
      // only here so the promise rejection doesn't log as uncaught.
    });
  }, [generateAhaWorkout, generationId]);

  // Animated reveal of narrated lines (skipped when VoiceOver is on).
  useEffect(() => {
    if (voiceOver) return;
    if (linesVisible >= BASE_LINES.length) return;
    const timer = setTimeout(() => {
      setLinesVisible((n) => Math.min(n + 1, BASE_LINES.length));
    }, LINE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [linesVisible, voiceOver]);

  // Three-phase latency budget.
  useEffect(() => {
    const p50 = setTimeout(() => setShowExtraLine(true), P50_MS);
    const p95 = setTimeout(() => setShowRetry(true), P95_MS);
    const p99 = setTimeout(() => {
      if (routedRef.current) return;
      routedRef.current = true;
      activateFallback();
      capture({ name: "plan_fallback_shown", props: {} });
      capture({
        name: "plan_generation_failed",
        props: { reason: "client_hard_kill_p99" },
      });
      router.replace("/onboarding/aha" as never);
    }, P99_MS);
    return () => {
      clearTimeout(p50);
      clearTimeout(p95);
      clearTimeout(p99);
    };
  }, [router, activateFallback]);

  // First-byte marker (client-side — server also emits its own).
  useEffect(() => {
    if (firstByteReportedRef.current) return;
    if (aha && aha.workout !== undefined && aha.status !== "failed") {
      firstByteReportedRef.current = true;
      capture({
        name: "plan_first_byte",
        props: { latencyMs: Date.now() - kickoffRef.current },
      });
    }
  }, [aha]);

  // Route forward on terminal statuses.
  useEffect(() => {
    if (routedRef.current) return;
    if (!aha) return;
    if (aha.status === "complete") {
      routedRef.current = true;
      router.replace("/onboarding/aha" as never);
      return;
    }
    if (aha.status === "failed") {
      routedRef.current = true;
      activateFallback();
      capture({
        name: "plan_generation_failed",
        props: { reason: String(aha.error ?? "server_failed").slice(0, 120) },
      });
      capture({ name: "plan_fallback_shown", props: {} });
      router.replace("/onboarding/aha" as never);
    }
  }, [aha, router, activateFallback]);

  const handleRetry = useCallback(() => {
    if (routedRef.current) return;
    setShowRetry(false);
    kickoffRef.current = Date.now();
    generateAhaWorkout({ generationId }).catch(() => {});
  }, [generateAhaWorkout, generationId]);

  const visibleCount = voiceOver ? BASE_LINES.length : linesVisible;

  return (
    <View className="flex-1 px-6 pt-8">
      <Text variant="h2" className="border-b-0 pb-0">
        Warming up.
      </Text>
      <View className="mt-6 gap-3">
        {BASE_LINES.map((line, index) => (
          <NarratedLine
            key={line}
            text={line}
            visible={index < visibleCount}
            immediate={voiceOver}
          />
        ))}
        {showExtraLine ? (
          <NarratedLine
            text={P50_EXTRA_LINE}
            visible
            immediate={voiceOver}
          />
        ) : null}
      </View>

      {showRetry ? (
        <View className="mt-8 gap-3" accessibilityRole="alert">
          <Text className="text-sm text-muted-foreground">
            {ERROR_COPY.AHA_LLM}
          </Text>
          <Button
            size="onboarding"
            variant="outline"
            onPress={handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry generating your session"
            testID="onboarding-analysis-retry"
          >
            <Text>Retry</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
