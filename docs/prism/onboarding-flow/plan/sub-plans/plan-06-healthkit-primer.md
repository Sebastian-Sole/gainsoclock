# Sub-Plan 06: HealthKit Primer + Ask (S5 / S5a / S5b)

## Dependencies
- **Requires:** plan-00 (tri-state onboarding hook), plan-01 (`userProfile` schema with bounded fields + `dataSource` union + `biologicalSex` optional + `ahaGenerationCount`; draft store Art. 9 in-memory slice), plan-03 (analytics capture, reduce-motion hook), plan-04 (HealthKit usage strings locked in `app.json`), plan-05 (intake stack + `_layout.tsx` + `onboarding` Button variant + `lib/format.ts` comma-decimal parsers + `lib/copy/errors.ts`).
- **Blocks:** plan-07 (aha action reads `userProfile` with populated stats + `dataSource`), plan-09 (day-3 re-ask card on home tab depends on the S11 deep-link primitive scaffolded here).

## Objective
Own the HealthKit surface. Before Apple's system permission sheet appears, Fitbull presents a calm, honest primer that (1) names the things it will NOT read, (2) names the three things it will read, (3) names the two things it will write, and (4) offers an equal-weight *Not now* button. On grant, S5a confirms prefilled values and collects the always-manual age field with a hard 16+ age gate. On denial, S5b is a single-screen manual form per Baymard §10 (memorised numerics stay together). The S11 day-3 re-ask primitive ships here too — plan-09 mounts it on the home tab. All analytics fire scope names only, never values. `lib/healthkit.ts` is locked down to the 3 read scopes + 2 write scopes already listed in `app.json`.

## Context

### Stack facts
- **iOS-only module:** `@kingstinct/react-native-healthkit`. Accessed ONLY through `lib/healthkit.ts` and `hooks/use-healthkit.ts`. Never imported directly from components.
- **Platform guard:** `Platform.OS === "ios"` on every call site; an Android path renders S5b-equivalent directly (though Android is out of V1, the guard is defensive).
- **Runtime:** Expo SDK 54, React Native 0.81, React 19.
- **Router:** Expo Router 6; three screens slot between S4 and S6 on the `app/onboarding/` stack.
- **Settings deep link:** `Linking.openSettings()` from `react-native`. HealthKit permission prompts cannot re-fire if previously denied — must route the user to system Settings.

### Coding conventions that apply here
- No `any`. HealthKit sample types have their own TS shapes; use `HKQuantitySample` / `HKUnit` from the module.
- No `enum`. `dataSource` union comes from plan-01's `dataSourceValidator` via `Infer<typeof dataSourceValidator>`.
- Every `<TextInput>` on S5a/S5b has a visible `<Label>` via `components/ui/label.tsx` with `nativeID`/`accessibilityLabelledBy`. Placeholder is not a label.
- Numeric input routes through `lib/format.ts` parsers (comma-decimal) — no regex duplication.
- Button size `onboarding` (48pt).
- Accessibility: every interactive has `accessibilityLabel` + `accessibilityRole`; primer content groups are VoiceOver-grouped (`accessibilityRole="header"` on each section head, children `accessibilityElementsHidden={true}`, parent `accessibilityLabel` concatenated).
- Analytics: scope names only, never values (HealthKit-Privacy C6).

### Gate decisions + themes that apply
- **HealthKit-Privacy CR4 / S0 strings:** `NSHealthShareUsageDescription` + `NSHealthUpdateUsageDescription` are locked in `app.json` (landed in plan-04). Do not modify.
- **HealthKit-Privacy C5 / UX #3:** primer copy order is locked — won't-reads FIRST, reads SECOND, writes THIRD, revocation, two equal-weight buttons.
- **HealthKit-Privacy C6:** analytics fire scope names only (`grantedScopes: string[]`). Never values.
- **HealthKit-Privacy C2:** re-ask cadence cap. 1 dismissal → suppress 30 days. 2 dismissals → permanent until user toggles in Settings. On `.sharingDenied` status, tap opens `Linking.openSettings()`.
- **AI-Safety #7:** hard 16+ age gate. Under-16 submission blocked with dedicated copy. Documented at `docs/compliance/age-gate.md`.
- **AI-Safety #4:** sanity bounds — age 16–100, weight 30–250 kg, height 120–230 cm, body-fat 3–60%. Client AND server (plan-01 enforces server-side).
- **UX #15:** `biologicalSex` moved OUT of intake; collected lazily at first calorie-calc tap (not this phase). Schema retains as optional.
- **Mobile-A11y #4:** VoiceOver grouping on primer — three accessible containers with consolidated labels.
- **Mobile-A11y #9:** every `<TextInput>` preceded by `<Label>` with `nativeID`/`accessibilityLabelledBy`.
- **Performance #10:** `lib/healthkit.ts` uses `limit: 1` + `sortDescriptors: [endDate DESC]`. Prefill ≤ 300ms on a dev device seeded with 2+ years of samples.
- **Baymard §10:** don't split memorised numerics — S5b single screen.
- **Theme B (session replay):** S5 / S5a / S5b are replay OFF (plan-03 allowlist). Don't regress.

### Files this sub-plan touches
- **New (routes):**
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/healthkit.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/healthkit-prefill.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/manual-stats.tsx`
- **New (components):**
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/healthkit-primer-section.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/age-gate-block.tsx`
- **New (home re-ask primitive; mounted by plan-09):**
  - `/Users/sebastiansole/Documents/gainsoclock/components/home/healthkit-reask-card.tsx`
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/healthkit.ts` — verify/extend read helpers; lock scope set
  - `/Users/sebastiansole/Documents/gainsoclock/hooks/use-healthkit.ts` — add `getAuthorizationStatus()` + `enable()` + `getLatestStats()` helper that wraps the three reads
  - `/Users/sebastiansole/Documents/gainsoclock/stores/intake-draft-store.ts` — add a `reaskState: { lastDismissedAt: string | null; dismissCount: number }` persisted slice (non-Art.9; it's interaction metadata, not body data)
- **New (docs):**
  - `/Users/sebastiansole/Documents/gainsoclock/docs/compliance/age-gate.md`

### Data contracts

**`lib/healthkit.ts` (read scopes — must match the `app.json` `NSHealthShareUsageDescription`):**
- `HKQuantityTypeIdentifierBodyMass` — read only.
- `HKQuantityTypeIdentifierHeight` — read only.
- `HKQuantityTypeIdentifierBodyFatPercentage` — read only.

**Write scopes (must match `NSHealthUpdateUsageDescription`):**
- `HKQuantityTypeIdentifierActiveEnergyBurned` — write.
- `HKWorkoutTypeIdentifier` — write.

NO age, biological sex, sleep, heart rate, cycle, labs, or workout-history reads. Do not add them without a matching legal update.

**Extended helper API:**
```ts
// lib/healthkit.ts
export async function requestAuthorization(): Promise<boolean>;
export async function getAuthorizationStatus():
  Promise<"notDetermined" | "sharingDenied" | "sharingAuthorized" | "sharingPartiallyAuthorized">;
export async function getLatestStats(): Promise<{
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPercent: number | null;
}>;
```
- Each individual read uses `queryQuantitySamples(identifier, { limit: 1, sortDescriptors: [{ key: "endDate", ascending: false }] })`. Returns `null` if no sample.
- `getLatestStats` calls all three in parallel with `Promise.all`.

**S5 primer — `app/onboarding/healthkit.tsx` layout (locked order, HealthKit-Privacy C5 / UX #3):**
1. Header: *"Import from Apple Health (optional)."*
2. **Won't-reads section (FIRST):** *"We don't read your sleep, heart rate, cycle, lab results, or workout history."*
3. **Reads section (SECOND):** *"We'll read your weight, height, and body fat percentage — so you don't have to type them."*
4. **Writes section (THIRD):** *"We'll save workouts you finish to Apple Health so your Fitness rings close."*
5. Revocation line: *"Change any of this in Settings > Privacy > Health."*
6. Two equal-weight buttons: `Import from Apple Health` (primary styling) and `Not now` (same size, same visual weight — NOT grey-underlined link). Both `Button size="onboarding"`.

**Primer accessibility (Mobile-A11y #4):**
- Each section is a single `<View>` with `accessibilityLabel` = consolidated sentence (e.g. "Health data we don't read: sleep, heart rate, cycle, labs, workout history.") and children marked `accessibilityElementsHidden={true}`.
- Group headings have `accessibilityRole="header"`.
- Both buttons receive `accessibilityLabel` emphasis equally; *Not now* does not feel like a secondary link.

**Component `healthkit-primer-section.tsx`:**
```tsx
export function HealthKitPrimerSection({
  kind, heading, body, // heading announced as role="header"; body masked from rotor-sweep
}: { kind: "wont-read" | "read" | "write" | "revocation"; heading: string; body: string }): JSX.Element;
```

**Primer screen actions:**
- *Import from Apple Health* tap:
  1. Capture `healthkit_primer_shown` on mount.
  2. Call `requestAuthorization()`. This triggers Apple's native sheet.
  3. On Apple-sheet result (regardless of user choice inside the sheet), query `getAuthorizationStatus()`.
  4. If status is `sharingAuthorized` or `sharingPartiallyAuthorized`:
     - `getLatestStats()` → write prefilled values into the draft store's in-memory Art. 9 slice.
     - Compute `grantedScopes: string[]` — only the read-identifier names for which the user actually granted (this is best-effort; Apple does not expose per-scope granularity directly, so pass the full requested read set OR check per-type `getAuthorizationStatusForType` if the module exposes it).
     - Capture `healthkit_granted { grantedScopes }`. **Never** values.
     - Route to `/onboarding/healthkit-prefill`.
  5. If status is `sharingDenied`:
     - Capture `healthkit_denied`.
     - Route to `/onboarding/manual-stats`.
- *Not now* tap:
  - Capture `healthkit_denied`.
  - Route to `/onboarding/manual-stats`.

**S5a prefill — `app/onboarding/healthkit-prefill.tsx`:**
- Sections in order: Age (always manual), Weight (prefilled, editable), Height (prefilled, editable), Body fat % (prefilled, editable, optional).
- Every field: `<Label>` + `<Input>` with `nativeID`/`accessibilityLabelledBy`.
- Values parsed via `parseAgeYears`, `parseWeightKg`, `parseHeightCm`, `parseLocaleNumber` (for bodyfat).
- **16+ age gate:** if `parseAgeYears(ageInput) < 16`, disable Continue and show `<AgeGateBlock>` error screen: *"Fitbull is for users 16 and older. Please come back when you're eligible."* No workaround path.
- Sanity bounds (client-side, for immediate feedback): if weight < 30 or > 250 kg → inline error under the field. Same for height 120–230 cm, bodyfat 3–60%. Server re-validates; plan-01 enforces.
- On Continue:
  - Write fields to draft store (in-memory Art. 9 slice).
  - Set `dataSource` on the draft as `"healthkit"` if all three prefills came from HealthKit, else `"mixed"` if any required field was edited.
  - Capture `manual_stats_complete { dataSource }` — no values.
  - Route to `/onboarding/consent` (S6).
- **Sensitive VoiceOver rule:** HealthKit-derived field values are NOT announced as the field becomes visible (they are prefilled at mount, user expects them). The only announcement is the screen heading. After the user edits a field and Continue is tapped, the post-submit summary on S6 (plan-05) announces values normally.
- **Performance:** prefill ≤ 300ms on seeded device.

**S5b manual — `app/onboarding/manual-stats.tsx`:**
- Single-screen form (Baymard §10) — all fields on one screen.
- Required: Age, Weight, Height.
- Optional: Body fat %.
- Biological sex is NOT collected here (UX #15 — lazy-collect at first calorie-calc tap).
- Same 16+ age gate as S5a.
- Same sanity bounds.
- `dataSource` = `"manual"` on write.
- Capture `manual_stats_complete { dataSource: "manual" }`.
- Route to `/onboarding/consent` (S6).

**`AgeGateBlock`:**
```tsx
export function AgeGateBlock(): JSX.Element;
```
- Full-screen block copy + single *Close* button (routes back to `/(auth)/sign-up` or exits app — decision: route back to sign-up and clear the session via existing auth sign-out).
- `docs/compliance/age-gate.md` documents the decision.

**S11 re-ask primitive — `components/home/healthkit-reask-card.tsx` (mounted by plan-09):**
```tsx
export function HealthKitReaskCard(): JSX.Element | null;
```
- Render condition (evaluated from `useQuery(api.onboarding.getProfile)` + `intake-draft-store.reaskState`):
  - `profile.dataSource === "manual"` AND `workoutLogs.count >= 1` (plan-09 query shape) AND (`reaskState.lastDismissedAt === null` OR >= 30 days AND `dismissCount < 2`).
- On render: capture `healthkit_reask_shown`.
- Primary CTA *"Import from Apple Health"*:
  - If `getAuthorizationStatus() === "sharingDenied"` → `Linking.openSettings()` + capture `healthkit_reask_shown` only (no grant event yet).
  - Else → `requestAuthorization()` → same flow as primer. On grant → prefill stats → update profile via a new `api.onboarding.updateHealthStats` mutation (shape below) + capture `healthkit_reask_granted`.
- Dismiss button:
  - Sets `reaskState.lastDismissedAt = now`, `dismissCount += 1`.
  - Capture `healthkit_reask_dismissed`.
- If `dismissCount >= 2`, card never renders again until user toggles in Settings (plan-08 adds the Settings toggle path; for V1 the permanent-suppression is documented and the user's recourse is Settings).

**`api.onboarding.updateHealthStats` (new public mutation; extend `convex/onboarding.ts`):**
- Args: `{ weightKg, heightCm, bodyFatPercent, dataSource }` — all optional except `dataSource`.
- Applies sanity bounds.
- Patches `userProfile` (not append-only — this is plain current state).
- Note: plan-01 shipped `completeOnboardingV2`; this is a sibling mutation. Add here in this phase to keep the re-ask flow self-contained.

**Analytics — every event values-free:**
- `healthkit_primer_shown { }`
- `healthkit_granted { grantedScopes: string[] }` — only identifier names
- `healthkit_denied { }`
- `manual_stats_complete { dataSource: "healthkit" | "manual" | "mixed" }`
- `healthkit_reask_shown { }`
- `healthkit_reask_granted { }`
- `healthkit_reask_dismissed { }`

### Gotchas (from reviews)

- **HealthKit-Privacy C6:** a future reviewer may want to fire `{ weightKg }` because "we already have it." No — values never fire. Scope names only. If the scope set ever widens to sex-indicative types, re-evaluate the rule.
- **HealthKit-Privacy C5 / UX #3:** won't-reads FIRST. A designer may want "reads first because it's positive framing." Decline — the order is explicit.
- **AI-Safety #7:** the age gate is binding. If the user enters 15, they cannot continue. Do not add a "I'll come back later" path that sneaks through.
- **Performance #10:** `lib/healthkit.ts` `limit: 1` + sort is load-bearing. If a reviewer removes it "because Apple Health returns latest first anyway," object.
- **HealthKit-Privacy C2:** on `.sharingDenied`, `requestAuthorization()` is a no-op — Apple will NOT re-prompt. You must `Linking.openSettings()`. Test both branches.
- **Theme B (replay):** S5 / S5a / S5b are OFF in the replay allowlist (plan-03). If you paste a new screen under `app/onboarding/*` by accident, verify the gating.
- **Mobile-A11y #4:** if you skip the VoiceOver grouping, each primer bullet announces separately and the user gets a rotor-sweep of 8+ items. Grouping is load-bearing.
- **Avoid bundling the module on Android:** use `Platform.OS === "ios"` checks when importing the HealthKit path; otherwise Android builds (even defensive ones) will fail to load the module.

## Implementation

1. **Verify `lib/healthkit.ts` scope set.**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/lib/healthkit.ts`
   - **What:** confirm the read set is exactly the three types listed; write set is exactly the two. Delete any stale identifier references (age, sex, workouts, sleep). Add a file-top comment: `// Scope set locked per app.json NSHealthShareUsageDescription / NSHealthUpdateUsageDescription. Changing this requires a legal + copy update.`
   - **Test:** `npx tsc --noEmit`.

2. **Extend `lib/healthkit.ts` + `hooks/use-healthkit.ts`.**
   - **What:** add `getAuthorizationStatus`, `getLatestStats` per Data contract. Each read uses `limit: 1` + `endDate DESC`.
   - **Approach:** `Promise.all` inside `getLatestStats`. Each read wrapped in try/catch; a failed read returns `null` for that field.
   - **Test:** dev-device smoke with HealthKit seeded with 2+ years of samples; log the p50 of `getLatestStats()`; must be ≤ 300ms.

3. **Extend `stores/intake-draft-store.ts` with `reaskState`.**
   - **File:** `/Users/sebastiansole/Documents/gainsoclock/stores/intake-draft-store.ts`
   - **What:** add a persisted slice `reaskState: { lastDismissedAt: string | null; dismissCount: number }`.
   - **Approach:** this IS persisted (it's interaction metadata, not Art.9 data). Include in `partialize`.
   - **Test:** `npx tsc --noEmit`; manually dismiss → relaunch → verify `dismissCount` survives.

4. **Extend `convex/onboarding.ts` with `updateHealthStats`.**
   - **What:** public mutation per Data contract. Sanity-bound; `getAuthUserId`; patches `userProfile`.
   - **Test:** `pnpm convex:dev`; REPL.

5. **Create `components/onboarding/healthkit-primer-section.tsx`.**
   - **What:** per Data contract. VoiceOver grouping.
   - **Test:** `npx tsc --noEmit`.

6. **Create `app/onboarding/healthkit.tsx` (S5 primer).**
   - **What:** per Data contract. Layout order locked. Two equal-weight buttons.
   - **Approach:** use `useHealthKit()` hook for grant action. Platform guard — on non-iOS, route directly to `/onboarding/manual-stats`.
   - **Analytics:** `healthkit_primer_shown` on mount. `healthkit_granted { grantedScopes }` / `healthkit_denied` on outcome.
   - **Test:** `npx tsc --noEmit`; manual — grant, deny, iOS simulator vs device.

7. **Create `components/onboarding/age-gate-block.tsx`.**
   - **What:** per Data contract.
   - **Test:** `npx tsc --noEmit`.

8. **Create `app/onboarding/healthkit-prefill.tsx` (S5a).**
   - **What:** per Data contract. Prefill from `getLatestStats()` at mount; editable.
   - **Approach:** `useEffect` on mount calls `getLatestStats`; writes to draft store. Inputs bind to draft fields; `parseAgeYears`/`parseWeightKg`/`parseHeightCm` on blur.
   - **16+ gate:** if age field contains a value < 16 on Continue tap, render `<AgeGateBlock>` full-screen overlay. No workaround.
   - **Test:** `npx tsc --noEmit`; manual — prefill appears in ≤ 300ms on seeded device; editing a prefilled field flips `dataSource` to `"mixed"` on Continue.

9. **Create `app/onboarding/manual-stats.tsx` (S5b).**
   - **What:** per Data contract. Single screen. Same 16+ gate + bounds.
   - **Test:** `npx tsc --noEmit`; manual.

10. **Create `components/home/healthkit-reask-card.tsx`.**
    - **What:** per Data contract. Renders null when conditions not met.
    - **Approach:** reads `useQuery(api.onboarding.getProfile)` for `dataSource`; reads Zustand `reaskState`; reads workoutLogs count via existing `api.workoutLogs.getCount` or similar (confirm the exact query name; if absent, plan-09 owns adding it — for this phase, leave a `TODO(plan-09)` guarded by an optional-chain so the card renders false under uncertainty).
    - **Not mounted here:** plan-09 mounts it on home tab.
    - **Test:** `npx tsc --noEmit`.

11. **Create `docs/compliance/age-gate.md`.**
    - **What:** short doc explaining the 16+ threshold decision, the copy, the user's recourse, and the rule's home in code (`AgeGateBlock` + server-side enforcement in `completeOnboardingV2`).
    - **Test:** content review.

12. **Verify session-replay OFF on S5 family.**
    - **What:** plan-03 set the allowlist. Confirm `/onboarding/healthkit`, `/onboarding/healthkit-prefill`, `/onboarding/manual-stats` are NOT in the allowlist (plan-03 put them in the denylist).
    - **Test:** manual — walk through S5 family; PostHog replay viewer shows no session for these routes.

### Test discipline
- Step 2: p50 ≤ 300ms measurement on seeded device.
- Step 4: REPL exercise of `updateHealthStats` with out-of-bounds values.
- Step 6: grant / deny smoke on iOS simulator (HealthKit partially mocked) and real device.
- Step 8: prefill smoke + 16+ gate + edit-flips-dataSource.
- Step 10: render-null condition verified.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Routes: `app/onboarding/healthkit.tsx`, `healthkit-prefill.tsx`, `manual-stats.tsx` exist.
- [ ] Primer layout: won't-reads FIRST, reads SECOND, writes THIRD, revocation, two equal-weight buttons (both Button `size="onboarding"`).
- [ ] Primer accessibility: three section groups with `accessibilityRole="header"` on headings, parent `accessibilityLabel` consolidated, children `accessibilityElementsHidden={true}`.
- [ ] S5a age gate: age < 16 renders `AgeGateBlock` and blocks Continue.
- [ ] S5a sanity bounds: out-of-range weight/height/bodyfat surfaces inline error; Continue disabled.
- [ ] S5a `dataSource` flips to `"mixed"` when any prefilled field is edited.
- [ ] S5b single screen: age + weight + height required; bodyfat optional; same 16+ gate and bounds.
- [ ] S5a/S5b inputs parse comma- and dot-decimals via `lib/format.ts`.
- [ ] S5a/S5b inputs each preceded by `<Label>` with `nativeID`/`accessibilityLabelledBy`.
- [ ] `lib/healthkit.ts` reads exactly 3 scopes (BodyMass, Height, BodyFatPercentage) with `limit: 1` + `endDate DESC`; writes exactly 2 scopes (ActiveEnergyBurned, WorkoutType).
- [ ] `hooks/use-healthkit.ts` exposes `getAuthorizationStatus` + `getLatestStats`.
- [ ] Analytics: `healthkit_primer_shown`, `healthkit_granted { grantedScopes }`, `healthkit_denied`, `manual_stats_complete { dataSource }` fire at the correct call sites; NEVER values.
- [ ] Perf: prefill ≤ 300ms on seeded device (recorded in PR description).
- [ ] Re-ask primitive: `components/home/healthkit-reask-card.tsx` exists with suppress-after-1/permanent-after-2 logic; `.sharingDenied` → `Linking.openSettings()`; `dismissCount` persists.
- [ ] `api.onboarding.updateHealthStats` exists with sanity bounds.
- [ ] `docs/compliance/age-gate.md` exists.
- [ ] Session replay OFF on S5 / S5a / S5b (verified in PostHog).
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Maestro: `testID` props on primer grant/dismiss buttons, prefill inputs, manual-stats inputs (plan-10 writes `.maestro/onboarding/02-healthkit-denied.yaml` + `04-intake-healthkit-grant.yaml`).
- [ ] Manual smoke:
  - Grant path: primer → Apple sheet → S5a with prefilled weight/height/bodyfat → age 25 → Continue → S6.
  - Denial path: primer → *Not now* → S5b → fill all → Continue → S6.
  - Grant-but-null-reads: primer → Apple sheet granted but no samples → S5a with empty fields → user fills manually → `dataSource: "mixed"` → Continue.
  - 16+ gate: S5a or S5b, enter age 15 → AgeGateBlock shows; no Continue.
  - `.sharingDenied` re-ask: induce denied state → card in home renders → tap → `Linking.openSettings()` fires.
- [ ] Out-of-scope: day-3 re-ask mount on home tab (plan-09); Settings privacy toggle for HealthKit (plan-08).

## Risks

- **Risk:** a HealthKit read throws because the user denied a specific sub-scope, and the uncaught error blows up the prefill screen.
  - **Detect:** manual test with partial denial.
  - **Mitigate:** wrap each read in try/catch; return `null` on throw. The `Promise.all` consolidates — a single read failing leaves the other two usable.
  - **Escalate:** if throws are frequent, switch to `Promise.allSettled`.

- **Risk:** scope-name analytics payload leaks info beyond intent (e.g. if a future scope like `hormoneTracking` were added, the scope name itself is sensitive).
  - **Detect:** plan-10 privacy audit.
  - **Mitigate:** the current three scopes (weight/height/bodyfat) are the same ones the user just consented to on Apple's sheet. The rule in `lib/analytics.ts` + this plan is: if scope set ever widens to sex-indicative types, re-evaluate.
  - **Escalate:** coordinate with plan-03 owner.

- **Risk:** `.sharingDenied` detection false-positives on first launch (status is `notDetermined`), and the card fires `Linking.openSettings()` instead of requesting.
  - **Detect:** smoke test on fresh install.
  - **Mitigate:** the card's CTA branches: `notDetermined` → `requestAuthorization()`; `sharingDenied` → `Linking.openSettings()`. Test both.
  - **Escalate:** if the HealthKit module conflates the two states, prefer `requestAuthorization()` as default — Apple returns immediately if already denied.

- **Risk:** AgeGateBlock is dismissible via gesture and user sneaks through.
  - **Detect:** manual test — swipe to dismiss; attempt to navigate around.
  - **Mitigate:** render as full-screen modal with `accessibilityViewIsModal={true}`; disable the back gesture on the screen. The screen's only action is the close button.
  - **Escalate:** if the user can side-route, add a server-side re-check in plan-07's aha action (already present — AI-Safety #4 re-verifies bounds).

- **Risk:** bundled on Android — the `@kingstinct/react-native-healthkit` module bundles a native Android artifact that breaks build.
  - **Detect:** `expo prebuild --platform android`.
  - **Mitigate:** `lib/healthkit.ts` uses conditional import via `.ios.ts` / `.android.ts` file variants if the module doesn't auto-elide on Android. Plan-00's project conventions mention `.ios.tsx` / `.web.tsx` pattern — same applies.
  - **Escalate:** Android is out of V1, so a guard-only approach is fine; full elision happens in V1.1.

- **Risk:** `getLatestStats` p50 blows budget on devices with massive HealthKit histories.
  - **Detect:** plan-10 measurement.
  - **Mitigate:** `limit: 1` + sort is the whole point; if Apple's sort is still slow, add a date range filter (last 180 days) to narrow the query.
  - **Escalate:** budget violation pauses plan-07 release.

- **Risk:** a reviewer wants to collect biological sex here (for BMR calc).
  - **Detect:** PR feedback.
  - **Mitigate:** UX #15 decided — lazy-collect at first calorie-calc tap. Do not collect in intake.
  - **Escalate:** cite gate decision; if challenged, call out to Sebastian.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. Maestro: `testID` props in place for plan-10 flows. `.maestro/onboarding/02-healthkit-denied.yaml` passes locally if scaffolded.
5. Manual smoke:
   - Grant, deny, grant-but-null-reads paths.
   - 16+ gate bounces age=15.
   - `.sharingDenied` opens Settings.
   - Prefill ≤ 300ms on seeded device.
   - Scope-names-only in analytics payloads (inspect PostHog).
   - Session replay OFF on S5 family (PostHog replay viewer silent).
6. VoiceOver smoke: primer rotor-sweep lands on 3 section headers + 2 buttons (not 8+ bullets).
7. Report diffs.
