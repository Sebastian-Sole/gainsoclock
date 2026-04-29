/**
 * Analytics wrapper. Components and Convex actions only ever talk to this
 * module — `posthog-react-native` is imported nowhere else. The wrapper enforces
 *
 *   1. a TypeScript-level firewall against ever shipping HealthKit / body-stat
 *      values to PostHog (see `NoHealthKitFields`),
 *   2. a defence-in-depth runtime key-scan that throws in dev and silently
 *      drops in prod,
 *   3. an explicit consent gate (no capture forwards before the user grants
 *      the `analytics` consent row), and
 *   4. session-replay start/stop on a route allowlist so screens that render
 *      body stats never make it into a replay.
 */

import type { PostHog } from "posthog-react-native";

// --- Event schema -----------------------------------------------------------

export type AnalyticsEvent =
  | { name: "intake_started"; props: Record<string, never> }
  | { name: "auth_method_selected"; props: { method: "apple" | "email" } }
  | { name: "auth_succeeded"; props: { method: "apple" | "email" } }
  | { name: "skipped_to_app"; props: { reason: "experienced_lifter" } }
  | { name: "intake_resumed"; props: Record<string, never> }
  | { name: "intake_restarted"; props: Record<string, never> }
  | { name: "goal_set"; props: { goals: string[]; primaryGoal: string } }
  | {
      name: "experience_set";
      props: { experience: "beginner" | "returning" | "experienced" };
    }
  | { name: "days_set"; props: { count: number; weekdays: number[] } }
  | { name: "healthkit_primer_shown"; props: Record<string, never> }
  | { name: "healthkit_granted"; props: { grantedScopes: string[] } }
  | { name: "healthkit_denied"; props: Record<string, never> }
  | { name: "healthkit_reask_shown"; props: Record<string, never> }
  | { name: "healthkit_reask_granted"; props: Record<string, never> }
  | { name: "healthkit_reask_dismissed"; props: Record<string, never> }
  | {
      name: "manual_stats_complete";
      props: { dataSource: "healthkit" | "manual" | "mixed" };
    }
  | {
      name: "consent_granted";
      props: { versionHash: string; purposes: string[] };
    }
  | { name: "plan_generation_started"; props: Record<string, never> }
  | { name: "plan_first_byte"; props: { latencyMs: number } }
  | { name: "plan_visible"; props: { latencyMs: number } }
  | { name: "plan_continue_tapped"; props: Record<string, never> }
  | { name: "plan_generation_failed"; props: { reason: string } }
  | { name: "plan_fallback_shown"; props: Record<string, never> }
  | {
      name: "paywall_interstitial_shown";
      props: { trialEligible: boolean };
    }
  | { name: "paywall_presented"; props: { placementId: string } }
  | { name: "revenuecat_ui_unavailable"; props: Record<string, never> }
  | {
      name: "trial_started";
      props: { source: "rc_intro" | "app_local" | "rc_temp" };
    }
  | { name: "trial_confirmation_shown"; props: Record<string, never> }
  | { name: "paid_converted"; props: { productId: string } }
  | {
      name: "reminder_email_sent";
      props: { hoursBeforeCharge: number };
    }
  | { name: "rage_quit"; props: { screen: string; msSinceMount: number } }
  | { name: "screen_render_ms"; props: { screen: string; ms: number } }
  | { name: "welcome_shown"; props: Record<string, never> }
  | { name: "welcome_continue"; props: Record<string, never> }
  | { name: "demo_chat_shown"; props: Record<string, never> }
  | { name: "demo_chat_continue"; props: Record<string, never> }
  | { name: "demo_chat_skipped"; props: Record<string, never> }
  | { name: "demo_meals_shown"; props: Record<string, never> }
  | { name: "demo_meals_continue"; props: Record<string, never> }
  | { name: "demo_meals_skipped"; props: Record<string, never> }
  | { name: "demo_workouts_shown"; props: Record<string, never> }
  | { name: "demo_workouts_continue"; props: Record<string, never> }
  | { name: "demo_workouts_skipped"; props: Record<string, never> }
  | { name: "founder_note_shown"; props: Record<string, never> }
  | { name: "founder_note_continue"; props: Record<string, never> }
  | { name: `activation_gate_${string}`; props: Record<string, never> };

// --- HealthKit firewall -----------------------------------------------------

/**
 * Keys that must never leave the device through analytics. Includes raw
 * HealthKit fields and any client-derived metric that could be inverted to
 * the underlying body-stat value.
 */
type ForbiddenKeys =
  | "weightKg"
  | "heightCm"
  | "ageYears"
  | "biologicalSex"
  | "bodyFatPercent"
  | "activityLevel"
  | "tdee"
  | "bmr"
  | "bmi"
  | "caloriesBurned"
  | "workoutDurationSec"
  | "restingHeartRate"
  | "activeCalories";

const FORBIDDEN_KEY_SET: ReadonlySet<string> = new Set<ForbiddenKeys>([
  "weightKg",
  "heightCm",
  "ageYears",
  "biologicalSex",
  "bodyFatPercent",
  "activityLevel",
  "tdee",
  "bmr",
  "bmi",
  "caloriesBurned",
  "workoutDurationSec",
  "restingHeartRate",
  "activeCalories",
]);

/**
 * Distributive conditional. `Extract<keyof T, ForbiddenKeys>` is the
 * intersection of the props' keys with the forbidden set. If empty, the
 * props pass through; otherwise we substitute `never`, which surfaces as a
 * ts(2322) at the `capture(...)` callsite.
 *
 * The earlier shape `keyof T extends ForbiddenKeys ? never : T` does NOT
 * distribute over union keys and is inert — see Theme A / Security CR1.
 */
export type NoHealthKitFields<T> =
  Extract<keyof T, ForbiddenKeys> extends never ? T : never;

// --- Module-level state -----------------------------------------------------

let postHogClient: PostHog | null = null;
let analyticsConsentGranted = false;

const PRE_CONSENT_BUFFERABLE: ReadonlySet<AnalyticsEvent["name"]> = new Set([
  "intake_started",
  "intake_resumed",
  "intake_restarted",
  "consent_granted",
  "skipped_to_app",
  "welcome_shown",
  "welcome_continue",
  "demo_chat_shown",
  "demo_chat_continue",
  "demo_chat_skipped",
  "demo_meals_shown",
  "demo_meals_continue",
  "demo_meals_skipped",
  "demo_workouts_shown",
  "demo_workouts_continue",
  "demo_workouts_skipped",
  "founder_note_shown",
  "founder_note_continue",
]);

const MAX_BUFFERED_EVENTS = 50;
const buffer: AnalyticsEvent[] = [];
let bufferOverflowWarned = false;

/**
 * Called by the PostHog provider once `InteractionManager.runAfterInteractions`
 * has resolved and the SDK is constructed. Passing `null` tears the wrapper
 * back down (used by tests).
 */
export function setPostHogClient(client: PostHog | null): void {
  postHogClient = client;
  if (client && analyticsConsentGranted) {
    void flushBuffer();
  }
}

/**
 * Called by the consent-gate wiring (`providers/convex-sync-provider.tsx`)
 * whenever the `userConsents.analytics` row flips. Granting flushes the
 * pre-consent buffer; revoking calls `posthog.optOut()` + clears the buffer.
 */
export function setAnalyticsConsent(granted: boolean): void {
  if (analyticsConsentGranted === granted) return;
  analyticsConsentGranted = granted;
  if (granted) {
    if (postHogClient) void postHogClient.optIn();
    void flushBuffer();
  } else {
    if (postHogClient) {
      void postHogClient.optOut();
    }
    buffer.length = 0;
  }
}

export function isAnalyticsConsentGranted(): boolean {
  return analyticsConsentGranted;
}

/**
 * Reset hook — call from sign-out so PostHog rotates the anonymous distinct
 * id for the next session and any pre-consent buffer is cleared.
 */
export function resetAnalytics(): void {
  buffer.length = 0;
  if (postHogClient) postHogClient.reset();
}

export function identifyAnalytics(distinctId: string): void {
  if (!postHogClient) return;
  postHogClient.identify(distinctId);
}

// --- Capture ----------------------------------------------------------------

export function capture<E extends AnalyticsEvent>(
  event: E & { props: NoHealthKitFields<E["props"]> }
): void {
  // Defence-in-depth: even if a future caller bypasses the type check (e.g.
  // through `as any` somewhere upstream), the runtime scan refuses forbidden
  // keys.
  const propKeys = Object.keys(event.props ?? {});
  for (const key of propKeys) {
    if (FORBIDDEN_KEY_SET.has(key)) {
      const message = `[analytics] forbidden key "${key}" in event "${event.name}"`;
      if (__DEV__) {
        throw new Error(message);
      }
      console.warn(message);
      return;
    }
  }

  if (!analyticsConsentGranted) {
    if (PRE_CONSENT_BUFFERABLE.has(event.name)) {
      enqueue(event);
    }
    return;
  }

  forward(event);
}

function enqueue(event: AnalyticsEvent): void {
  if (buffer.length >= MAX_BUFFERED_EVENTS) {
    if (!bufferOverflowWarned) {
      bufferOverflowWarned = true;
      console.warn(
        `[analytics] pre-consent buffer full (${MAX_BUFFERED_EVENTS}); dropping event "${event.name}"`
      );
    }
    return;
  }
  buffer.push(event);
}

function forward(event: AnalyticsEvent): void {
  if (!postHogClient) {
    // Client not ready yet — buffer briefly so the first events of the
    // session aren't lost while `InteractionManager` resolves init.
    enqueue(event);
    return;
  }
  postHogClient.capture(event.name, event.props);
}

async function flushBuffer(): Promise<void> {
  if (!postHogClient || !analyticsConsentGranted) return;
  if (buffer.length === 0) return;
  const toFlush = buffer.splice(0, buffer.length);
  bufferOverflowWarned = false;
  for (const event of toFlush) {
    postHogClient.capture(event.name, event.props);
  }
}

// --- Init -------------------------------------------------------------------

export type InitPostHogArgs = {
  apiKey: string;
  host?: string;
};

let initInFlight: Promise<PostHog | null> | null = null;

/**
 * Lazily constructs the PostHog client. Safe to call multiple times — the
 * first call wins and subsequent calls return the same promise. Mounted via
 * `InteractionManager.runAfterInteractions` from `providers/posthog-provider.tsx`
 * so initialisation never blocks first paint.
 */
export async function initPostHog(args: InitPostHogArgs): Promise<PostHog | null> {
  if (postHogClient) return postHogClient;
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    if (!args.apiKey) {
      console.warn("[analytics] EXPO_PUBLIC_POSTHOG_API_KEY missing — analytics disabled");
      return null;
    }
    const { default: PostHogCtor } = await import("posthog-react-native");
    // Constructed without `PostHogProvider` JSX, so the SDK never auto-captures
    // screens — the `captureScreens` option only applies to the JSX provider.
    // Screen views, if any, must be emitted via `capture()` explicitly.
    const client = new PostHogCtor(args.apiKey, {
      host: args.host ?? "https://eu.i.posthog.com",
      captureAppLifecycleEvents: false,
      enableSessionReplay: true,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        maskAllSandboxedViews: true,
      },
      disableGeoip: true,
    });
    setPostHogClient(client);
    // Default to opted-out until consent flips us on. PostHog persists the
    // opt-out flag across launches.
    if (!analyticsConsentGranted) {
      try {
        await client.optOut();
      } catch (e) {
        console.warn("[analytics] optOut failed", e);
      }
    }
    return client;
  })();

  try {
    return await initInFlight;
  } finally {
    initInFlight = null;
  }
}

// --- Session-replay route gating -------------------------------------------

const REPLAY_ALLOWLIST: ReadonlySet<string> = new Set([
  // S1 sign-up landing
  "/(auth)/sign-up",
  "/(auth)/sign-in",
  // intake screens that don't render body-stat content
  "/onboarding/goal",
  "/onboarding/experience",
  "/onboarding/days",
  // consent screen — chrome only; PII inputs masked by default
  "/onboarding/consent",
  // paywall + main app shell
  "/onboarding/paywall",
  "/(tabs)",
]);

function normalisePath(pathname: string): string {
  if (!pathname) return "";
  let p = pathname.toLowerCase();
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function isAllowlistedPath(pathname: string): boolean {
  const p = normalisePath(pathname);
  if (REPLAY_ALLOWLIST.has(p)) return true;
  // Allow nested (tabs) screens — anything inside the main tab tree is
  // chrome/empty-state territory; body-stat surfaces live in `/onboarding/*`
  // which are matched explicitly above.
  if (p.startsWith("/(tabs)")) return true;
  return false;
}

export function startReplayForRoute(pathname: string): void {
  if (!postHogClient) return;
  if (isAllowlistedPath(pathname)) {
    void postHogClient.startSessionRecording();
  } else {
    void postHogClient.stopSessionRecording();
  }
}

export function stopReplay(): void {
  if (!postHogClient) return;
  void postHogClient.stopSessionRecording();
}

// Test-only: lets the type negative-test file reach internal symbols without
// triggering a "value imported but never used" lint warning. Not part of the
// runtime API.
export const __INTERNAL_FOR_TESTS = {
  forbiddenKeys: FORBIDDEN_KEY_SET,
  bufferLength: () => buffer.length,
};
