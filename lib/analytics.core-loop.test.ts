import { afterEach, describe, expect, it, vi } from "vitest";
import type { PostHog } from "posthog-react-native";
import {
  __INTERNAL_FOR_TESTS,
  capture,
  setAnalyticsConsent,
  setPostHogClient,
} from "@/lib/analytics";

/**
 * Contract tests for the core-loop events added in plan 049:
 * workout_logged, meal_logged, achievement_unlocked, notification_opened,
 * review_opened.
 *
 * Each event must (a) pass the runtime forbidden-key scan and reach a
 * consented client unchanged, and (b) be DROPPED — not buffered — before
 * consent is granted, since none of these five are in
 * `PRE_CONSENT_BUFFERABLE` (core-loop signal from a non-consented user
 * must not be retained).
 *
 * `PostHog` is a real class with private fields, so a plain stub object
 * can't satisfy it structurally — the cast below is the standard escape
 * hatch for injecting a test double through `setPostHogClient`, matching
 * the "as unknown as" pattern already used elsewhere in this codebase
 * (e.g. `stores/achievements-store.ts`).
 */
function createStubClient() {
  const captureSpy = vi.fn();
  const stub = {
    capture: captureSpy,
    optIn: vi.fn(),
    optOut: vi.fn(),
    reset: vi.fn(),
    identify: vi.fn(),
  };
  return { client: stub as unknown as PostHog, captureSpy };
}

describe("core-loop analytics events", () => {
  afterEach(() => {
    setAnalyticsConsent(false);
    setPostHogClient(null);
  });

  it("forwards workout_logged to a consented client", () => {
    const { client, captureSpy } = createStubClient();
    setPostHogClient(client);
    setAnalyticsConsent(true);

    capture({
      name: "workout_logged",
      props: { exerciseCount: 4, setCount: 12, fromTemplate: true },
    });

    expect(captureSpy).toHaveBeenCalledWith("workout_logged", {
      exerciseCount: 4,
      setCount: 12,
      fromTemplate: true,
    });
  });

  it("forwards meal_logged to a consented client", () => {
    const { client, captureSpy } = createStubClient();
    setPostHogClient(client);
    setAnalyticsConsent(true);

    capture({ name: "meal_logged", props: { method: "manual" } });

    expect(captureSpy).toHaveBeenCalledWith("meal_logged", { method: "manual" });
  });

  it("forwards achievement_unlocked to a consented client", () => {
    const { client, captureSpy } = createStubClient();
    setPostHogClient(client);
    setAnalyticsConsent(true);

    capture({ name: "achievement_unlocked", props: { achievementId: "streak_7" } });

    expect(captureSpy).toHaveBeenCalledWith("achievement_unlocked", {
      achievementId: "streak_7",
    });
  });

  it("forwards notification_opened to a consented client", () => {
    const { client, captureSpy } = createStubClient();
    setPostHogClient(client);
    setAnalyticsConsent(true);

    capture({
      name: "notification_opened",
      props: { identifier: "daily-workout-reminder" },
    });

    expect(captureSpy).toHaveBeenCalledWith("notification_opened", {
      identifier: "daily-workout-reminder",
    });
  });

  it("forwards review_opened to a consented client", () => {
    const { client, captureSpy } = createStubClient();
    setPostHogClient(client);
    setAnalyticsConsent(true);

    capture({ name: "review_opened", props: { hadExistingReview: false } });

    expect(captureSpy).toHaveBeenCalledWith("review_opened", {
      hadExistingReview: false,
    });
  });

  it("drops (does not buffer) core-loop events before consent is granted", () => {
    // No client, no consent — default module state after the afterEach reset.
    capture({
      name: "workout_logged",
      props: { exerciseCount: 1, setCount: 1, fromTemplate: false },
    });

    expect(__INTERNAL_FOR_TESTS.bufferLength()).toBe(0);
  });
});
