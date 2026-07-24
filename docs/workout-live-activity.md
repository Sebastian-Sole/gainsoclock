# Workout Live Activity — lock-screen set logging

Log sets, run the rest timer, and finish a workout from the lock screen /
Dynamic Island without unlocking the phone (iOS 17+; the card renders
display-only down to 16.2's ActivityKit floor but the extension targets 17.0).
Supersedes the rest-timer-only activity (`docs/rest-timer-live-activity.md`,
`expo-live-activity` — removed): the rest countdown is now one state of the
workout activity.

Design + option analysis: the "Lock-Screen Set Logging" Claude artifact
(2026-07-23). Decisions locked there: interactive Live Activity via
`@bacons/apple-targets` + hand-written SwiftUI (not Voltra), strict two-row
adjust mode projected from the MetricSpec registry, notification-reply input
rejected, architecture kept watch-ready (event bus, shared Swift module).

## Architecture (event-sourced session bus)

```
JS (Zustand workout-store)
  └─ hooks/use-workout-activity.ts   (root-mounted, app/_layout.tsx)
       ├─ OUT: lib/activity-projection.ts  buildSessionPlan()
       │        → lib/live-activity.ts syncWorkoutActivity(plan JSON)
       │        → modules/fitbull-workout-activity (Expo module, pod)
       │        → ObjC runtime → WorkoutActivityBridge (app target)
       │        → UserDefaults plan + ActivityKit start/update
       └─ IN:  drainActivityEvents() on mount/hydration/foreground
                → planEventReplay() → store actions (updateSet/rest/finish)

Lock-screen tap (app backgrounded or terminated, JS asleep)
  Button(intent:) in widget → LiveActivityIntent perform() RUNS IN APP PROCESS
  → WorkoutActivityBridge.handle*() → appends ActivityEvent to UserDefaults,
    advances the plan queue, updates the activity, schedules/cancels the
    rest notification → card refreshes instantly, JS reconciles later.
```

- **No App Group.** Every reader/writer of the plan/event store runs in the
  app process (`LiveActivityIntent` is executed there by iOS); the widget
  process only renders ActivityKit content state. Plain `UserDefaults`.
- **One wire format.** `targets/workout-widget/_shared/*.swift` is compiled
  into BOTH the app target and the widget extension by `@bacons/apple-targets`
  (its `_shared/` convention). The Expo module pod contains no ActivityKit and
  no attributes copy — it reaches the app-target bridge via
  `NSClassFromString("WorkoutActivityBridge")`, avoiding the duplicated-
  Attributes pattern used by most RN examples.
- **JSON contract.** `lib/activity-projection.ts` (TS) ↔
  `WorkoutSessionStore.swift` (Swift) mirror each other
  (`PLAN_SCHEMA_VERSION`). Change them together.
- **Replay is idempotent.** Events carry `workoutId`; replay drops foreign
  ids, skips already-completed sets, and collapses rest events to the latest.
  A lock-screen set-log is indistinguishable from an in-app one downstream
  (history store → convex-sync queue → HealthKit), so offline-first sync is
  untouched.
- **Finish is two-phase.** `FinishWorkoutIntent` marks the card
  "Workout saved — open Fitbull" and appends `finishRequested`; the actual
  finish (history write, HealthKit, Convex, navigation) runs on next app open
  via `useFinishWorkout` from the reconcile hook.
- **Watch-ready.** The event log + `_shared` Swift module are the seam a
  future watchOS app plugs into (events over WatchConnectivity into the same
  replay path; the Live Activity demotes to a mirror).

## Adjust mode (two-row projection)

Rows come from the exercise's ordered metric list through the same
`MetricSpec` registry as Focus Mode (`lib/metrics.ts`): first two steppable
metrics (pace is derived → read-only), steps from the registry
(weight ±2.5, reps ±1, duration ±5s under 2 min / ±15s above, decimal ±0.5
fallback). Remaining metrics render as "… in app". The cardio triple keeps its
invariant because replay goes through `updateSet` → `solveCardioTriple`; the
card shows a derived pace line computed natively from the stepped values.
Stopwatch-owned exercises (`activeWorkout.stopwatch`) are demoted to
"open app" so lock-screen logging can't race an in-app timing session.

## Degradation contract

`lib/live-activity.ts` no-ops silently when: Android/web; the dev client was
built without the module; iOS < 16.2; Live Activities disabled by the user;
bridge class missing from the binary. On iOS 16.x the extension (17.0 target)
is simply inactive. The in-app logger, rest timer, and notifications never
depend on this feature.

## Build & test on device

The repo commits `ios/`; Xcode Cloud builds it as-is. Same dance as the
rest-timer spike (that doc, "How to build & test", steps 1–4: prebuild
--clean, restore `ios/ci_scripts` + `sentry.properties`, re-point version
plumbing, `pnpm version:check`). New this time:

1. The prebuild must produce a `WorkoutActivity` extension target with
   `_shared` files ALSO in the Fitbull app target (check pbxproj membership).
2. First archive: the App ID `com.soleinnovations.fitbull.WorkoutActivity`
   may need to exist in the developer portal for signing.
3. Device matrix (iOS 17+ physical device or simulator):
   - Start a workout, lock the phone → card shows current set, prefilled.
   - Log set from lock screen → card advances + rest countdown starts + rest
     notification fires at 0 → open app → set is completed in the logger,
     rest timer mirrored.
   - Adjust → steppers change values (comma-decimal in nb_NO locale) → Log →
     open app → adjusted values on the completed set.
   - −15s/+15s/Skip rest parity with in-app timer after reconcile.
   - Finish from lock screen → "Workout saved" card → open app → complete
     screen, log in history, Convex sync fired.
   - Kill the app (swipe away), tap Log set → still works (intent relaunches
     the app process in background); reconcile on next open.
   - Cardio exercise → time/distance rows, derived pace line updates.
   - Stopwatch (timed set) session open → card says open-app, no Log button.
   - iOS Settings → Fitbull → Live Activities off → everything in-app works.
   - Android/web: untouched.

## Known limitations (v1)

- **Rest hitting 0:00 while backgrounded** leaves the card in resting mode
  until the next tap/foreground (no process runs at expiry). The rest
  notification still fires on time (scheduled natively at rest start). Same
  limitation as the old rest-timer activity.
- **Adjust steppers can't cross a set's metric palette** — exotic edits
  (RPE, adding metrics, swapping exercises) deep-link into the app.
- **8-hour ActivityKit ceiling**: iOS ends the activity itself; the workout
  in the app is unaffected.
- Android has no equivalent surface yet (Phase 3: ongoing notification with
  action buttons).

## Rollback

Remove the `@bacons/apple-targets` plugin entry + `targets/workout-widget/` +
`modules/fitbull-workout-activity/`, restore `expo-live-activity` (pinned
0.4.2) + its plugin entry + `lib/live-activity.ts` from git history, re-run
prebuild. The JS layer (`lib/activity-projection.ts`,
`hooks/use-workout-activity.ts`) is inert without the native module (silent
no-ops) and can stay.
