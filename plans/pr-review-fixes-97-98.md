# Fix plan: review findings for PR #97 and PR #98

Self-contained plan for a fresh context window. Every finding below was independently
**verified against the actual code** by an adversarial review pass (multi-angle finders →
one verifier per finding). Verdicts are noted. Do not re-litigate CONFIRMED items; the
"Refuted — do not fix" section lists claims that were checked and found wrong, so don't
re-flag them.

## Context

- Repo: `/Users/sebastiansole/Documents/gainsoclock` (Fitbull — Expo SDK 54 / RN 0.81 / Convex; pnpm only).
- PR #97 `feat/composable-metrics` → main: composable exercise metrics + Focus Mode logging,
  offline-sync change (trust Convex socket over NetInfo), notification suppression.
  https://github.com/Sebastian-Sole/gainsoclock/pull/97
- PR #98 `feat/chat-voice-dictation` → main: mic dictation in AI-coach chat via
  `expo-speech-recognition@3.1.3`. https://github.com/Sebastian-Sole/gainsoclock/pull/98
- Fixes land **on the PR branches** (push to the same branch updates the PR). Work PR #97
  first (it's the bigger, riskier change), then switch branches for #98 and re-run
  `pnpm install` after switching (dependency sets differ).
- Line numbers below are from review time; re-locate by symbol/quote if drifted.

### Verification gates (run before each commit)

- `npx tsc --noEmit` (app code) and `pnpm convex:dev` typecheck (convex/ is excluded from root tsconfig)
- `pnpm lint`
- `pnpm test` (Vitest over `lib/**` — several fixes below need new/updated characterization tests)
- `/verify` if available in the session; never `--no-verify`
- Repo rules that constrain these fixes: comma-decimal parsing must route through
  `lib/format.ts`; no hardcoded hex (theme tokens); every interactive element needs
  `accessibilityLabel` + `accessibilityRole`; no hand-edited version numbers;
  Convex validators in `convex/validators.ts` are the source of truth.

---

## PR #97 — feat/composable-metrics

### Blocking

#### 97-1. Offline queue bypassed when socket appears connected (CONFIRMED — data loss / clobber)

`lib/convex-sync.ts:262-266`: `isOffline = !isSocketConnected() && (isConnected === false || isInternetReachable === false)`.
When NetInfo says offline but the Convex WS still reports connected, the write takes the
live path `client.mutation()`. Problems:

- The Convex client buffers mutations **in memory** and never rejects on network loss, so
  the `.catch(...)` re-enqueue at `lib/convex-sync.ts:309-312` never fires (the code's own
  comment at 249-251 admits this).
- The clientId is absent from `getPendingClientIds()` (lines ~227-234: memoryQueue +
  inFlightClientIds only), so a concurrent hydration merge (`lib/hydration-merge.ts:64-65`)
  treats the local record as unprotected and overwrites the just-made edit with stale
  server data.
- Force-quit before the in-memory buffer drains = the write is permanently lost (before
  this PR it was durably queued in AsyncStorage and replayed on next launch).

**Fix:** track live-sent mutations as in-flight: add the clientId to `inFlightClientIds`
(or a parallel set surfaced by `getPendingClientIds()`) before calling
`client.mutation()`, and remove it only when the promise resolves. On rejection, keep the
existing re-enqueue. Consider also persisting the payload to the AsyncStorage queue first
and dequeuing on ack ("write-through queue") if it fits the existing queue semantics —
that also fixes the force-quit loss. Add a Vitest case to `lib/convex-sync.test.ts`:
"live-sent mutation's clientId is visible to getPendingClientIds until acked".

#### 97-2. `useNetwork().isOffline` disagrees with the new sync policy (CONFIRMED — UX regression in the PR's own target scenario)

`hooks/use-network.ts:11` still computes `isOffline` from NetInfo only
(`stores/network-store.ts` is fed exclusively by the NetInfo listener in
`providers/network-provider.tsx`). In the exact scenario this PR was written for
(simulator: `isInternetReachable=false`, socket healthy), mutations sync fine while:
offline banner shows (`components/shared/offline-banner.tsx:11`), chat input disabled
(`app/(tabs)/chat.tsx:290`, `app/chat/[id].tsx:164`), health import blocked
(`hooks/use-health-import.ts:67`), auth guard + RevenueCat registration affected
(`hooks/use-auth-guard.ts`, `providers/convex-sync-provider.tsx:103`).

**Fix:** publish the socket state into `stores/network-store.ts`. `setConvexClient` in
`lib/convex-sync.ts` already subscribes to the client's connection state (that's how the
queue flush works) — from that same subscription, write `socketConnected` into the network
store, and change `isOffline` to `!socketConnected && (isConnected === false || isInternetReachable === false)`
so UI gating and sync share one rule. Keep the derivation in ONE place (the store), not
per-consumer.

#### 97-3. Workout summary volume tile: wrong unit for lbs users, meaningless for cardio (CONFIRMED)

`app/workout/summary.tsx:27-35` computes `sum(weight*reps)` from raw stored values;
`:85-90` hardcodes the label "kg volume". Weight is stored in the **user's display unit**
(`lib/achievements.ts:5`; other consumers convert via `KG_PER_LB`, e.g. achievements.ts:764-767).
So a `weightUnit='lbs'` user sees a pounds number labeled "kg". The screen renders exactly
three tiles (duration / sets / volume) with no branch on session type, so a run/row/watts-bike
session (this PR's own presets) headlines "0 kg volume". It also doesn't exclude
rest sub-sets the way `lib/stats.ts:184-192` does.

**Fix:** (a) read `weightUnit` from the settings store and label the tile with it (or
convert to kg — labeling with the user's unit is simpler and matches the rest of the app);
(b) when volume is 0 / no set tracks weight+reps, fall back to a meaningful headline
(total distance or duration from the session); (c) reuse one volume helper — extract
`sessionVolume(exercises)` into `lib/stats.ts` with the same `isRestInterval` exclusion
and call it from both stats and summary. Add a Vitest case for the helper.

#### 97-4. Stale interval distance inflates totals after a metric switch (CONFIRMED — behavior change on existing data)

Old `lib/stats.ts` counted interval distance only when `variant==='work' && metric==='distance'`.
New code (`lib/stats.ts:184-188` and the duplicate block at `:329-336`) adds `set.distance`
for **any non-rest set** regardless of `set.metric`. `handleMetric` in
`components/workout/interval-set-inputs.tsx:93-97` only does `onUpdate({ metric: next })`
and never clears `distance`/`speed`/`paceSeconds`, and `makeIntervalSet` seeds `distance: 0`
— so a set entered as distance then switched to pace keeps stale distance that now lands in
`totalDistance`/`maxDistance` (line ~213).

**Fix (do both):** (a) in `handleMetric`, clear the value fields not belonging to the newly
selected metric (`onUpdate({ metric: next, distance: undefined, speed: undefined, paceSeconds: undefined, ...keep selected })`);
(b) in both stats blocks, gate interval-set distance on `set.metric === 'distance'` (this
also protects already-persisted stale data, which (a) alone cannot). Extend
`lib/stats.test.ts` with: interval set with `metric:'pace'` and residual `distance` → not
counted.

### Strongly recommended

#### 97-5. AI exercise validation silently falls back to weight×reps (CONFIRMED)

`convex/aiTools.ts:82-83` made `type` optional and checks `metrics` only with
`assertArray`; `coerceMetricIds` (convex/metricsMap.ts:50-65) silently drops unknown ids;
`normalizeExerciseMetrics` falls back to `['weight','reps']` when coercion yields empty.
Near-miss ids from the model (`'watts'`, `'hr'` instead of `power_avg`, `heart_rate_avg`)
persist a cardio exercise as a strength exercise with no surfaced error. (The tool schema
does enum METRIC_IDS at `convex/chatActions.ts:60`, which lowers but doesn't eliminate the risk.)

**Fix:** in `validateExercise`, validate each metric id against `METRIC_IDS` and **throw**
on unknown (the AI tool-call layer surfaces the error back to the model for retry);
require `type` OR non-empty valid `metrics`; make the `['weight','reps']` fallback
unreachable from the AI path.

#### 97-6. New metrics produce no stats/PBs; `aggregation`/`prDirection` are dead config (CONFIRMED — feature gap)

`computeExerciseStats`/`computeTotals` in `lib/stats.ts` hardcode reps/weight/distance/time.
`aggregation` and `prDirection` in `lib/metrics.ts` are consumed nowhere (only defined +
unit-tested). The PR's own presets (watts bike, rowing) show only time+distance; power,
HR, pace, speed, cadence, calories never appear in totals or PBs.

**Fix (decision needed — pick one):**
- *Implement:* drive the accumulators off the registry — iterate the set's tracked metrics,
  dispatch on `aggregation` ('sum' → totals, 'avg' → running average, 'max'/prDirection →
  PBs). Keep the four legacy fields as-is for compatibility, add the rest generically.
- *Descope consciously:* if this is too big for the PR, remove the unused
  `aggregation`/`prDirection` fields from `lib/metrics.ts` (dead config invites false
  confidence) and open a follow-up issue "registry-driven stats" instead.

#### 97-7. Focus Mode BigInput cluster (CONFIRMED ×3 — conventions)

`components/workout/focus/focus-set-card.tsx`:
- Lines ~44-49: third hand-rolled comma-decimal parse (`/^\d*[.,]?\d*$/` +
  `parseFloat(input.replace(',', '.'))`) — `lib/format.ts:33` has the canonical
  `parseLocaleNumber`; classic `components/workout/set-input.tsx:36` also hand-rolls.
- Lines ~53-65: the numeric `TextInput` has **no `accessibilityLabel`** (only
  `placeholder="—"` + testID). The visible `spec.label` (line ~173) isn't associated.
- Line ~60: `placeholderTextColor="#9ca3af"` hardcoded (same value in classic set-input.tsx:50).

**Fix:** extract ONE shared numeric-input building block (hook or component) used by both
`SetInput` and `BigInput`, routing parsing through `parseLocaleNumber` — this fixes the
duplication and the protected comma-decimal invariant in one move. Pass
`accessibilityLabel={spec.label}` (and `accessibilityRole` where applicable) into the
TextInput. Resolve placeholder color from the theme (there's an existing
`useRingColors`-style hook pattern that reads theme HSL vars at runtime — reuse it; RN
props can't take Tailwind classes). Also fix `components/nutrition/macro-progress.tsx:10-14`:
`MACRO_COLORS` duplicates `--chart-protein/carbs/fat` from global.css — resolve those
tokens instead of hardcoding hex.

#### 97-8. convex/metricsMap.ts ↔ lib/metrics.ts mirrors already diverge (CONFIRMED)

Convex `coerceMetricIds` de-dupes (`metricsMap.ts:50-65`, `seen` Set); the lib copy
(`metrics.ts:280-284`) does not. `MAX_METRICS = 5` vs `MAX_METRICS_PER_EXERCISE = 5` are
separate constants. The drift test `lib/types-drift.test-types.ts` only asserts the
MetricId/ExerciseType/WorkoutSet unions — mapping bodies and MAX values are unguarded.

**Fix:** make the two `coerceMetricIds` behave identically (add de-dupe to the lib copy),
and extend the drift guard: a Vitest test that imports both modules and asserts
`legacyTypeToMetrics` mappings are deep-equal for every ExerciseType and the MAX constants
match (convex/metricsMap.ts is plain TS with no Convex runtime imports, so Vitest can
import it; if that assumption breaks, assert against a shared fixture instead).

### Minor (batch into one cleanup commit if convenient)

- **Rest timer** `app/workout/active.tsx:198` (CONFIRMED, latent): `restTimeSeconds > 0 ? ... : DEFAULT_REST_TIME`
  coerces an explicit 0 to 90s; main's behavior was "0 → no timer". Only reachable via
  imported/legacy data today (presets are [30,60,90,120,180]). Fix: start the timer only
  when `restTimeSeconds > 0`.
- **Foreground re-arm** `hooks/use-notification-setup.ts:163-166` (CONFIRMED): every
  `active` transition maps the whole log history + 2-3 native notification calls with no
  guard. Fix: keep a `lastArmedDate` (yyyy-MM-dd) + last log-count ref; re-arm only on day
  rollover or when logs changed.
- **Migration N+1** `convex/migrations.ts:20,51-56` (CONFIRMED, one-shot): per-row
  `by_user_clientId` lookups for exercises already `.collect()`ed. Fix: build a
  `Map<userId|clientId, type>` once. Low priority; fix only if the migration hasn't run yet.
- **Validator defense-in-depth** `convex/validators.ts:39` (PLAUSIBLE): `workoutSetValidator`
  is now flat all-optional; no live producer writes interval sets without `variant`, but the
  server no longer rejects malformed ones and stats would count them as work sets. Cheap
  hardening: in the workout-log write path, default `variant:'work'` for `type:'intervals'`
  sets missing it.
- **Unit-label duplication** `components/workout/set-header-row.tsx:24-28` +
  `focus-set-card.tsx:103-107` (CONFIRMED): identical weight→weightUnit / distance→distanceUnit
  override in two components. Fix: shared `userUnitFor(id, weightUnit, distanceUnit)` in
  `lib/metrics.ts`; callers keep their own fallback (columnLabel vs unit).

---

## PR #98 — feat/chat-voice-dictation

### Blocking

#### 98-1. Dictation loses everything except the last utterance (CONFIRMED — core feature broken)

The hook starts recognition with `continuous: true` + `interimResults: true`. In that mode
the library delivers each **segment's** transcript in `results[0]` (per its README:
"Final results cover new segments and are new utterances… concatenate with the previous
final result"). But `components/chat/chat-input.tsx` computes
`setText(base + ' ' + transcript)` from `dictationBaseRef` captured **once at mic-press**,
and `onResult` ignores `isFinal`. Speak "I did five sets" *(pause)* "of squats" → only
"of squats" survives.

**Fix:** accumulate finalized segments — on `isFinal`, advance the base:
`dictationBaseRef.current = base ? `${base} ${transcript}` : transcript`; interim results
render `base + currentInterim` only. Prefer moving the accumulation **into the hook**
(expose a composed transcript) so the component stays dumb and both platforms
(Android restarts per utterance; iOS finalizes segments) are handled in one place.

#### 98-2. Recognition lifecycle gaps (CONFIRMED ×3 + 1 plausible)

All in `hooks/use-speech-recognition.ts` / `components/chat/chat-input.tsx`:

- **No unmount cleanup:** the hook's only effect syncs callback refs and has no cleanup;
  nothing calls `stop()`/`abort()` on unmount. Navigating away mid-dictation leaves the
  native mic session live. Fix: `useEffect(() => () => { ExpoSpeechRecognitionModule.abort(); }, [])`
  (guard so it only aborts if this instance started listening).
- **Send-while-listening repopulates the input:** `handleSend` does
  `if (listening) stop(); onSend(text); setText('')` — `stop()` requests a final result,
  which arrives after the clear and runs `setText(staleBase + transcript)`. Fix: use
  `abort()` in handleSend (no final result), or reset `dictationBaseRef` and gate
  `onResult` behind a "sending" flag.
- **Double-tap start race:** `handleMicPress` guards on `listening`, which only flips when
  the async native `start` event arrives — a fast double-tap calls `start()` twice and
  resets the base ref. Fix: a synchronous `startingRef` set at press time; guard on it.
- **(Plausible, verify while in there)** if the input becomes `disabled` while
  `listening` (assistant responding), the greyed-out mic leaves no way to stop recording.
  Fix: keep the mic tappable to STOP even when `disabled`, or auto-abort on disable.

#### 98-3. `available` hardcoded true on native (CONFIRMED)

`hooks/use-speech-recognition.ts` returns `{ available: true, ... }` — nothing calls
`ExpoSpeechRecognitionModule.isRecognitionAvailable()`. The mic renders on Android
devices without speech services and on simulators; tapping fails with only a warning buzz.

**Fix:** derive `available` in an effect from `isRecognitionAvailable()` (keep the
`.web.ts` stub's `available: false`). Ensure the exported signatures of the `.ts` and
`.web.ts` variants stay identical.

#### 98-4. Revert the hand-edited version bump (CONFIRMED convention violation)

The PR hand-edits all five version homes: `app.json` `expo.version` 1.0.1→1.1.0,
`expo.ios.buildNumber` 2→3, `expo.android.versionCode` 2→3, and
`ios/Fitbull.xcodeproj/project.pbxproj` `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`
(both configs). They're internally consistent so `pnpm version:check` passes, but
`.claude/rules/coding-conventions.md` reserves bumps for `pnpm release:*` at upload time.

**Fix:** revert every version-field change from this branch (git checkout those hunks from
main). Do NOT run `pnpm release:*` yourself — that's the release owner's call.

### Recommended

#### 98-5. Error haptic fires on benign outcomes (CONFIRMED)

`onError: (code) => { if (code === 'not-allowed') { Alert... } warningHaptic(); }` —
the haptic runs for every code including `no-speech` (user paused) and `aborted` (user
tapped stop). Fix: skip `warningHaptic()` for `no-speech` and `aborted`; keep it for
`not-allowed` / `service-not-allowed` / genuine failures.

#### 98-6. Hardcoded hex for the listening state (CONFIRMED)

`components/chat/chat-input.tsx:~84-93`: `backgroundColor: listening ? '#ef4444' : 'transparent'`
and icon `color={listening ? '#fff' : ...}`. A calibrated `destructive` /
`destructive-foreground` token pair exists in tailwind.config.js. These are RN props (not
classNames), so resolve the theme values at runtime the way the send button sources from
`constants/theme` — no literals. Do NOT swap the Pressables for the `Button` primitive
(verified: its `icon` size is 40pt, below the 44pt target these correctly hit).

#### 98-7. Single source for the mic usage string (PLAUSIBLE — drift risk)

`NSMicrophoneUsageDescription` lives in three tracked places: the `expo-speech-recognition`
plugin options in `app.json`, the hardcoded constant in `plugins/with-microphone-usage.js`,
and the committed `ios/Fitbull/Info.plist`. All byte-identical today. NOTE (verified): the
plugin-ordering comment is **correct** — with-microphone-usage registered first runs last
and legitimately wins; don't "fix" the ordering. Fix the duplication only: share one
constant (e.g. the plugin reads the string from app.json extra or a single module) so the
copies can't drift.

#### 98-8. App Store privacy label (process note — not code)

Adding `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` changes the
app's privacy posture. Before submitting a build with this PR, update the App Store
Connect privacy nutrition label (microphone/audio data). Surface this in the PR
description; nothing to code.

---

## Refuted — do NOT fix (verified false; listed so they aren't re-flagged)

- **PR97** `lib/achievements.ts` weight-0 spurious PR: 0 becomes the baseline and PRs
  require `weight > prior`; 0>0 is false. Old code behaved the same. No bug.
- **PR97** `convex/aiTools.ts` "create paths drop suggestedTime/suggestedDistance": all
  three insert paths persist both fields on the actual branch (the PR diff's merge-base
  made one path look missing). No bug.
- **PR97** BigInput "renders 0 as blank" as a Focus-specific bug: classic `SetInput`
  renders 0 as blank identically; consistent pre-existing behavior (weight 0 is legit for
  bodyweight). Only revisit as deliberate product work.
- **PR98** per-keystroke listener re-subscription: expo's `useEventListener` stores the
  callback in a ref; no re-subscribe on identity change. No fix needed (the hook's own
  onResultRef indirection is redundant but harmless).
- **PR98** dual-ChatInput cross-talk via global listeners: nothing currently navigates to
  `app/chat/[id]`; at most one ChatInput is mounted. Only relevant if that route gets wired up.
- **PR98** replace mic/send Pressables with `components/ui/button.tsx`: Button `icon` is
  40pt (< 44pt HIG target) and force-dismisses the keyboard; the custom Pressables are
  more correct here.
- **PR98** `requestPermissionsAsync()` per tap: returns immediately from cached status
  when already granted; no perceptible latency.
- **PR98** config-plugin ordering "bug": verified correct as written (reverse-order mods;
  first-registered runs last and wins).

## Suggested execution order

1. Branch `feat/composable-metrics`: 97-1 → 97-2 (same subsystem, one commit each),
   97-4, 97-3, 97-5, 97-7, 97-8, then the minor batch. 97-6 needs a product decision —
   ask before implementing vs descoping.
2. Branch `feat/chat-voice-dictation` (run `pnpm install` after switching): 98-1 + 98-2
   together (same files; add the accumulation to the hook first), 98-3, 98-4 (separate
   revert commit), 98-5, 98-6, 98-7. Note 98-8 in the PR description.
3. Run the verification gates before each commit; push updates the open PRs (#97, #98).
