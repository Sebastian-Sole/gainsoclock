# White Hat — PostHog React Native integration for onboarding measurement

**Perspective:** White Hat (facts only, no opinions, no recommendations)
**Topic:** PostHog wiring for the onboarding funnel (Inquiry #11 in `orient.md`)
**Date:** 2026-04-21

Confidence tags: 🟢 verified against primary docs or local source, 🟡 verified against secondary/community sources, 🔴 not verified.

---

## 1. Current repo state

🟢 `package.json` at commit `8c7830e` contains no PostHog packages. No `posthog-react-native`, `posthog-react-native-session-replay`, or `posthog-node`. `pnpm.overrides` pins only `react-native-nitro-modules@0.32.2`.

🟢 `app/_layout.tsx` nests providers (outermost → innermost): `NetworkProvider` → `ConvexAuthProvider` → `ConvexSyncProvider` → `RootNavigator` → `GestureHandlerRootView` → `SafeAreaProvider` → `ThemeProvider` → `OnboardingProvider` → `Stack`. `PortalHost` is a sibling of `Stack` inside `ThemeProvider`.

🟢 `providers/` currently contains: `convex-sync-provider.tsx`, `network-provider.tsx`, `onboarding-provider.tsx` (spotlight tour, not analytics).

🟢 `convex/_generated/api.ts` is CLI-generated. No Convex action currently imports `posthog-node`.

🟢 Expo SDK `~54.0.33`, RN `0.81.5`, React `19.1.0`, React Compiler + New Architecture on (per `CLAUDE.md`).

---

## 2. Install procedure (Expo SDK 54)

🟢 Official Expo install (PostHog "Product analytics → Installation → React Native"):

```
npx expo install posthog-react-native expo-file-system expo-application expo-device expo-localization
```

🟢 For session replay, add `posthog-react-native-session-replay` to that command.

🟢 PostHog states: "For Expo projects, there are no mobile native dependencies outside of supported Expo packages." No config plugin declared.

🟢 Session replay requires `posthog-react-native >= 3.2.0`, Android API 26+, iOS 13+, development build (Expo Go unsupported). Fitbull already ships `expo-dev-client@~6.0.20`.

🟡 Community search says latest `posthog-react-native` is `4.42.1` (April 2026). The old `PostHog/posthog-react-native` GitHub repo was archived 2025-07-30; source now lives under `PostHog/posthog-js/tree/main/packages/react-native`. 🔴 Couldn't verify 4.42.1 directly on npm (npmjs.com fetch returned 403); PostHog docs still reference v3 migration notes.

🟢 New Architecture posture: SDK 54 has New Arch on by default (Expo docs). PostHog's RN SDK is documented as "written entirely in JS, using only Expo supported libraries." 🔴 Explicit "Fabric-compatible" wording not found; inference only.

🟢 Peers Fitbull already has: `@react-native-async-storage/async-storage@^2.2.0`. Peers Fitbull would need to add: `expo-file-system`, `expo-application`, `expo-device`, `expo-localization` (none currently present).

---

## 3. Provider mounting

🟢 Canonical pattern (RN docs):

```tsx
<PostHogProvider apiKey="<ph_project_token>" options={{ host: "https://eu.i.posthog.com" }}>
  {children}
</PostHogProvider>
```

🟢 `const posthog = usePostHog()` only works inside the provider.

🟢 No documented conflict with Convex providers. `PostHogProvider` is a plain React context provider; ordering relative to `ConvexAuthProvider` / `ConvexSyncProvider` is a free choice. The PostHog tutorial wraps `Stack.Navigator` inside `NavigationContainer` — a React Navigation pattern, not Expo Router.

🔴 Whether autocapture's `captureScreens` hooks Expo Router navigation events (vs. React Navigation's) is not documented in the fetched pages.

---

## 4. Event capture API

🟢 From `posthog-react-native` docs:

- `posthog.capture(eventName: string, properties?: Record<string, any>)`
- `posthog.identify(distinctId: string, properties?: Record<string, any>)`
- `posthog.screen(name: string, properties?)`
- `posthog.group(groupType, groupId, properties?)`
- `posthog.reset()`
- `useFeatureFlag(key)`, `getFeatureFlag(key)`, `isFeatureEnabled(key)`
- `posthog.setPersonPropertiesForFlags({...})`

🟢 Autocapture option keys on the provider: `captureTouches`, `captureScreens`, `ignoreLabels`, `customLabelProp`, `maxElementsCaptured`, `noCaptureProp`. Default `noCaptureProp` is `"ph-no-capture"`, read from `accessibilityLabel` or `accessibilityIdentifier` — not a custom prop.

🟢 Default RN properties auto-added: `$timestamp`, `description`, `text`, `screen_name`, `elements_chain`, plus lifecycle events `$app_installed`, `$app_updated`, `$app_opened`, `$app_active`, `$app_backgrounded`.

🟢 Sensitive-field protection: password fields and inputs with `secureTextEntry` are auto-excluded even without `ph-no-capture`.

---

## 5. Identify + anonymous → authed merge

🟢 PostHog generates an anonymous `distinctId` locally on first event (persisted via async-storage / expo-file-system).

🟢 `identify(distinctId, properties)` links anonymous → identified: "all past and future events made with that anonymous ID are now associated with the distinct ID." Recommended call sites: app load (if identity known) or immediately after login.

🟢 Convex auth boundary: `ConvexAuthProvider` is in `app/_layout.tsx`; `getAuthUserId(ctx)` is the server-side truth (per `coding-conventions.md`). The Convex user `_id` (a `v.id("users")`) serves as PostHog `distinctId`. `hooks/use-auth-guard.ts` is the existing client-side auth signal.

🟢 `reset()` on logout is documented as "strongly recommended."

🟢 `alias()` constraint: "the alias_id must not have been previously used as the distinct_id argument of an identify() or alias() call." In the common sign-up flow, `identify()` merges the anonymous ID automatically — explicit `alias()` is not required.

---

## 6. Feature flags + A/B bootstrapping

🟢 Flags are evaluated server-side then cached. Default: after SDK init there is a delay before flags resolve; reading a flag early returns `undefined`.

🟢 Bootstrap shape (RN, from PostHog "client-side bootstrapping" doc):

```tsx
<PostHogProvider
  apiKey="<token>"
  options={{
    host: "https://eu.i.posthog.com",
    bootstrap: {
      distinctID: "<optional>",
      isIdentifiedID: false,
      featureFlags: { "onboarding-intake-length": "short", "paywall-timing": "after" },
    },
  }}
>
```

🟢 Bootstrapped values are "temporary and are disregarded after PostHog fetches flag values." Persistent override: `posthog.featureFlags.overrideFeatureFlags({ flags: {...} })` (web API documented; 🔴 RN signature not explicitly shown).

🟢 `setPersonPropertiesForFlags({...})` lets the client send properties (locale, goal, etc.) that server-side flag conditions read before `identify()` is called.

---

## 7. Session replay on React Native

🟢 PostHog's "Mobile session replay" page lists React Native as supported alongside iOS, Android, Flutter. 🟡 A PostHog X post (2024-09) called it beta "while we gather feedback"; the docs page carries a note that it is still evolving. GA-vs-beta status in 2026 is ambiguous.

🟢 Requirements: `posthog-react-native >= 3.2.0`, separate `posthog-react-native-session-replay` package, Android API 26+, iOS 13+, development build. Project Settings → "Record user sessions" must be enabled in the dashboard.

🟢 Config:

```ts
options: {
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: true,   // default; password inputs always masked
    maskAllImages: true,       // default
    captureLog: true,          // Android only
    captureNetworkTelemetry: true, // iOS only
    sampleRate: 0.2,           // 0.0–1.0
  },
}
```

🟢 Default masking is restrictive: all text, inputs, images masked. `secureTextEntry` auto-detected.

🟡 `PostHogMaskView` component for manual masking, imported from `posthog-react-native`. 🔴 Full API not verified.

🟡 Known issue `PostHog/posthog#40006`: "setting `maskAllTextInputs: false` turns recordings fully black." Current status unknown.

---

## 8. EU cloud, GDPR, Nordic data residency

🟢 EU host: `https://eu.i.posthog.com`. Servers in Frankfurt, Germany.

🟢 PostHog Cloud EU disables IP capture by default for new projects.

🟢 Data-deletion tooling exists for right-to-be-forgotten requests.

🟢 Opt-out requirement: "you must stop all data capturing and processing." Cookieless tracking is supported.

🔴 DPA availability, SCCs, sub-processor list, adequacy mechanism wording not visible on the fetched GDPR page. Nordic-specific posture (Datatilsynet, IMY) not mentioned. Verify in PostHog's legal portal before production.

---

## 9. Server-side events from Convex actions (posthog-node)

🟢 Install: `npm install posthog-node` (equivalent `pnpm add posthog-node`).

🟢 Init:

```ts
import { PostHog } from "posthog-node";
const client = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: "https://eu.i.posthog.com",
  flushAt: 1,
  flushInterval: 0,
});
```

🟢 Capture:

```ts
client.capture({ distinctId: convexUserId, event: "...", properties: {...} });
```

🟢 PostHog's serverless recipe (Lambda/Vercel — applies to Convex actions):
1. Prefer `captureImmediate()` over `capture()` (guarantees HTTP request finishes before function exit).
2. Set `flushAt: 1`, `flushInterval: 0`.
3. `await client.shutdown()` before the action returns.

🟢 Fitbull's action pattern lives in `convex/chatActions.ts` / `convex/aiTools.ts`; third-party work belongs in actions, not mutations (per `coding-conventions.md`).

🟢 Key management: `npx convex env set POSTHOG_API_KEY ...` (Convex dashboard env vars), read as `process.env.POSTHOG_API_KEY`. No secrets committed.

🔴 Convex-specific compatibility note from PostHog not found; inferred from Convex actions being Node-compatible.

---

## 10. Apple privacy nutrition label implications

🟢 Default autocapture on RN collects: touches (element description, accessibility label, screen name), app lifecycle events, anonymous distinct ID stored locally. Session replay adds screenshots, network telemetry (iOS), logs (Android).

🟢 Per-event system properties include device/OS info via `expo-device`, `expo-application`, `expo-localization` peers. IP is captured unless suppressed (EU default).

🔴 Apple `PrivacyInfo.xcprivacy` manifest shipping with `posthog-react-native` was NOT verified. Likely nutrition-label categories: "Identifiers (Device ID)", "Usage Data (Product interaction)", "Diagnostics". Linked-vs-not-linked depends on whether `identify()` is called.

---

## 11. Cost model — free tier (April 2026)

🟢 From `posthog.com/pricing`:
- Product analytics: 1M events/month free
- Session replay: 5K web / 2.5K mobile recordings/month free
- Feature flags: 1M requests/month free
- Surveys: 1,500 responses/month free
- Error tracking: 100K exceptions/month free
- LLM analytics: 100K events/month free

🟢 EU vs US cloud: no price difference documented.

🟢 With 2 TestFlight users today, all caps are orders of magnitude beyond near-term volume. The first cap likely to bind in production is mobile session recordings (2.5K/month ≈ 83/day).

---

## 12. Community templates

🟢 `PostHog/support-rn-expo` (github.com/PostHog/support-rn-expo) — official Expo + RN sample from PostHog covering provider init, session replay, surveys. 🔴 Exact Expo SDK version not extracted from overview page.

🟢 `posthog.com/tutorials/react-native-analytics` — shows `PostHogProvider` wrapping `Stack.Navigator` inside `NavigationContainer` (React Navigation, not Expo Router). `usePostHog()` + `identify()` after form submit.

🟢 `posthog.com/contents/docs/product-analytics/installation/react-native.mdx` (docs source on GitHub) — authoritative install snippets.

🟡 DEV Community post on Remix + Cloudflare demonstrates the `flushAt: 1` / `flushInterval: 0` / `shutdown()` serverless pattern — transferable to Convex actions in principle.

---

## 13. Unresolved items

🔴 Latest `posthog-react-native` version on npm (search suggests `4.42.1`; not directly verifiable).
🔴 Explicit New Architecture / Fabric compatibility statement.
🔴 Expo Router autocapture screen tracking (docs reference React Navigation only).
🔴 Session-replay GA vs beta status in 2026.
🔴 `PostHogMaskView` API against primary docs.
🔴 Apple `PrivacyInfo.xcprivacy` manifest shipped by the SDK.
🔴 PostHog DPA, sub-processor list, Nordic data-handling posture.
🔴 Current status of `PostHog/posthog#40006` (black recordings with `maskAllTextInputs: false`).
