# Rest-Timer Live Activity (Dynamic Island) — Spike Notes (#115)

Shows the running rest timer as an iOS Live Activity: a countdown in the
Dynamic Island (iPhone 14 Pro and later) and on the Lock Screen (any device on
iOS 16.2+). Started when the rest timer starts, ended on skip / expiry /
workout finish / workout discard. Android and web are untouched (silent no-op).

## Chosen approach: `expo-live-activity@0.4.2` (config plugin)

Candidates evaluated (July 2026):

| Option | Verdict |
|---|---|
| `expo-widgets` (Expo's official widgets + Live Activities) | **Not usable here.** Alpha in SDK 55, stable in SDK 56. This repo is on SDK 54. Revisit on the next SDK upgrade — it is the designated successor. |
| `expo-live-activity` (software-mansion-labs) | **Chosen.** Deprecated/archived in favor of `expo-widgets`, but its 0.4.x line was built during the SDK 53/54 era and its peer deps are permissive (`expo: *`). Fully config-plugin driven — no hand-written native target, no hand edits to `ios/`. Ships a prebuilt SwiftUI widget (title, subtitle, countdown, island presentations). |
| `expo-apple-targets` + hand-written Swift ActivityKit target | Most control, most surface to own (SwiftUI target **plus** a local Expo module to bridge start/end to JS). Overkill for a countdown; fallback if the chosen lib breaks on a future SDK upgrade. |

Why a countdown is the easy case: ActivityKit renders
`Text(timerInterval:)` / `ProgressView(timerInterval:)` natively, so the
island updates every second **with zero pushes and zero JS involvement**. We
only start the activity with an end date and end it. `expo-live-activity`
exposes exactly that: `startActivity(state, config)` with
`progressBar.date` (epoch ms end date), `updateActivity`, `stopActivity`.

Pin note: the dependency is pinned exactly (`0.4.2`, no `^`) because the
package is archived; `0.5.0-alpha1` exists and should not be picked up
implicitly.

## What was implemented

- `lib/live-activity.ts` — wrapper in the style of `lib/haptics.ts` /
  `lib/healthkit.ts`. Exports `startRestActivity(endsAt, exerciseName?)` and
  `endRestActivity()`. All `expo-live-activity` access lives here. Guards:
  `Platform.OS === 'ios'`, lazy `require` in try/catch, try/catch around every
  native call, single cached activity id. Calling `startRestActivity` while an
  activity is live updates it in place (covers "+15" and back-to-back sets).
- `hooks/use-rest-timer.ts` — starts the activity in the same effect that
  schedules the rest OS notification; ends it where the notification is
  cancelled (timer stop/expiry) and in `stop()` (user skipped).
- `hooks/use-finish-workout.ts` — `endRestActivity()` next to the existing
  deterministic `cancelRestTimerNotification()` calls on both the finish and
  discard paths (same #100 race rationale: the hook effect can unmount before
  `isActive` flips).
- `stores/workout-store.ts` + `lib/types.ts` — `startRestTimer` takes an
  optional `exerciseName`; stored as `activeWorkout.restTimerExerciseName` so
  the Live Activity can show which exercise you're resting from. "+15" (no
  exercise context) keeps the existing name.
- `app.json` — `"expo-live-activity"` added to `plugins`. At prebuild the
  plugin injects `NSSupportsLiveActivities` into the app Info.plist and
  generates a `LiveActivity` widget-extension target (bundle id
  `com.soleinnovations.fitbull.LiveActivity`, deployment target 16.2) from
  Swift files shipped inside the npm package.
- `scripts/check-app-version.mjs` — now strips surrounding quotes when
  comparing pbxproj version values. The plugin writes the extension target's
  `MARKETING_VERSION = "1.1.1";` (quoted); without this, `pnpm version:check`
  would fail on the PR that commits the regenerated `ios/`.
- No settings gate in v1 — the activity is tied to the rest-timer lifecycle.
  The OS rest notification keeps its own `notificationsRestTimerEnabled` gate;
  the Live Activity is intentionally independent of it (the user can disable
  Live Activities per-app in iOS Settings).

## Verified vs unverified

**Verified in this branch (no iOS build possible in the sandbox):**

- `npx tsc --noEmit`, `pnpm lint` (0 errors; only pre-existing warnings),
  `pnpm test` (236 passing) all green.
- `npx expo config --type prebuild` evaluates: `NSSupportsLiveActivities:
  true`, extension registered under
  `extra.eas.build.experimental.ios.appExtensions` (EAS-only metadata,
  harmless for Xcode Cloud).
- A full `expo prebuild --platform ios` was executed against a **scratch copy**
  of the repo: the plugin ran cleanly and produced `ios/LiveActivity/` (Swift
  widget sources + entitlements + Info.plist) and a correct pbxproj target
  (deployment target 16.2, right bundle id). A missing `assets/liveActivity`
  folder is only a warning (we ship no images in v1).
- Degradation contract by code inspection: the package imports its native side
  via `requireOptionalNativeModule`, so on a dev client built **without** the
  extension the import succeeds and the module object is `null`; our wrapper
  catches the resulting throw and no-ops. Android/web return before any
  library call. On iOS < 16.2 or with Live Activities disabled, the native
  module throws; caught the same way. The rest timer and its notification are
  unaffected in every failure mode.

**Unverified (needs a real device/Xcode build):**

- That the `ExpoLiveActivity` pod compiles against Expo SDK 54's
  `ExpoModulesCore` in Xcode Cloud. This is the main risk: the pod is
  autolinked from `node_modules`, so **the next iOS CI build compiles it as
  soon as this branch's `pnpm-lock.yaml` lands — even before anyone re-runs
  prebuild**. (Podspec targets iOS 15.1 with runtime `#available` guards, so
  `pod install` itself won't conflict with the app's 15.1 target.)
- Island + Lock Screen rendering, compact/expanded presentations, countdown
  accuracy.
- Signing of the new extension target in Xcode Cloud. The generated target has
  **no `DEVELOPMENT_TEAM`** build setting; with automatic signing Xcode
  usually resolves it, but the App ID
  `com.soleinnovations.fitbull.LiveActivity` may need to exist in the
  developer portal. Check the first archive carefully.
- The deep link (`fitbull://workout/active`) from tapping the activity.
- Whether the countdown and the rest-complete notification feel redundant
  together (issue #115 flags suppression as a possible follow-up).

## How to build & test on device

The repo commits `ios/`, and Xcode Cloud builds it as-is (its `ci_post_clone`
runs `pnpm install` + `pod install`, **not** prebuild). So the extension only
exists in binaries after someone regenerates and commits `ios/`:

1. `pnpm install` (brings in `expo-live-activity`).
2. `pnpm clean:build` (`expo prebuild --clean --platform ios`).
3. **Restore what prebuild does not own** (pre-existing repo dance, all caught
   by `pnpm version:check` / git):
   - `git checkout -- ios/ci_scripts ios/sentry.properties` (prebuild deletes
     them; they are not plugin-generated).
   - Re-point version plumbing: regenerated `ios/Fitbull/Info.plist` carries
     literal versions and the app target reverts to `1.0`/`1`; restore
     `$(MARKETING_VERSION)`/`$(CURRENT_PROJECT_VERSION)` references and pbxproj
     values to match `app.json` (compare against git; `pnpm version:check`
     must pass).
4. `pod install` in `ios/` (or let `pnpm ios` do it), build to a physical
   iPhone 14 Pro+ (island) or an iOS 17+ simulator of the same models (island
   renders in the simulator; Lock Screen presentation works on any 16.2+ sim).
5. Test matrix:
   - Complete a set with a rest time → island/Lock Screen shows "Rest Timer",
     exercise name, live countdown.
   - "+15" → countdown extends in place (no second activity).
   - Skip → activity disappears.
   - Let it expire in foreground → activity disappears.
   - Let it expire with the app **backgrounded** → known limitation below.
   - Finish and discard a workout mid-rest → activity disappears.
   - iOS Settings → Fitbull → disable Live Activities → timer + notification
     still work, no crash.
   - Android/web smoke: rest timer unaffected.
6. Commit the regenerated `ios/` (pbxproj with the `LiveActivity` target,
   `ios/LiveActivity/`, `Podfile.lock` picking up `ExpoLiveActivity`) and let
   Xcode Cloud archive it. Verify the archive contains the appex and that
   TestFlight installs show the activity.

## Known limitations (v1)

- **Stale countdown at 0:00 when backgrounded.** If the app is backgrounded
  when the timer expires, no JS runs to end the activity; the island sits at
  0:00 until the app is next foregrounded (the existing AppState listener then
  stops the timer and the effect ends the activity). The OS notification still
  fires at the right moment. Fixing this needs ActivityKit `staleDate` or push
  updates — neither is exposed by `expo-live-activity`.
- The rest-complete **notification is not suppressed** while an activity is
  visible (both fire). Deliberate for the spike; revisit with real-device UX.
- Requires iOS 16.2+ (the library's floor; ActivityKit itself is 16.1+).
- No images in the island in v1 (`assets/liveActivity` intentionally absent).

## Rollback

- **iOS CI breaks because the pod fails to compile** (before any ios/ regen):
  revert this branch's commit (removes the dependency, plugin entry, and
  lockfile entry), `pnpm install`. App code changes are inert without the
  package, but the revert removes them anyway.
- **Extension/signing trouble after `ios/` was regenerated:** revert the
  `ios/` regeneration commit. The JS layer silently no-ops against a binary
  without the module — the app stays fully functional. Optionally also remove
  `"expo-live-activity"` from `app.json` plugins so the next prebuild doesn't
  recreate the target.
- The store field (`restTimerExerciseName`) and version-check quote handling
  are harmless to keep in either case.
