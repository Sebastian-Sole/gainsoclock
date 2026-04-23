# Sub-Plan 05: Intake Screens S2–S4 + S6

## Dependencies
- **Requires:** plan-00 (legacy onboarding gone; tri-state hook), plan-01 (`completeOnboardingV2`, `goalValidator`, `experienceValidator`, `consentPurposeValidator`, intake-draft store with Art. 9 in-memory split, `lib/consent.ts`, `lib/id.ts`), plan-03 (analytics `capture`, route allowlist for session replay, reduce-motion hook), plan-04 (S1 sign-up + skeptic side-door + abandonment interstitial in place).
- **Blocks:** plan-06 (HealthKit primer inserts between S4 and S6; lives on the same `_layout.tsx`), plan-07 (aha action needs a completed `userProfile`).

## Objective
Ship the intake stack layout and four of its six screens: S2 goal, S3 experience, S4 training days, and S6 GDPR consent + intake summary. S5 / S5a / S5b live in plan-06 and slot in between S4 and S6 through the same `_layout.tsx` stack. This phase also delivers the 5-dot progress indicator that spans S2–S6, the canonical error copy file, the new `onboarding` Button variant for 48pt touch targets on iPhone SE, the locale-aware numeric parsers in `lib/format.ts` used later by S5a/S5b/S6, and the Strava-dry copy rubric committed alongside.

## Context

### Stack facts
- **Runtime:** Expo SDK 54, React Native 0.81, React 19, React Compiler on.
- **Router:** Expo Router 6 with typedRoutes. New directory: `app/onboarding/` with `_layout.tsx` (stack) and per-screen files. Existing `app/onboarding.tsx` is demolished — delete it, replace with the directory.
- **Styling:** NativeWind v4; merge via `cn()`. `components/ui/button.tsx` is a `cva`-based primitive; extend variants rather than forking.
- **Path alias:** `@/*`.
- **Persistence:** `stores/intake-draft-store.ts` (from plan-01) — split slice, 300ms debounce + persist-on-blur, Art. 9 in-memory only.
- **Assets:** WebP goal cards, ≤40KB each, bundled under `assets/onboarding/`, `expo-image` with blurhash. Never fetched at runtime (Performance #7).

### Coding conventions that apply here
- No `any`; no `enum`. Goal + experience + day-of-week types are literal unions sourced from `@/convex/_generated/dataModel` or `convex/validators.ts` via an `infer`.
- Every interactive: `accessibilityLabel` + `accessibilityRole`. 44×44pt minimum — use the new `onboarding` size variant on Button (`h-12` = 48pt).
- Placeholder is not a label — every `<TextInput>` on S5 family (plan-06) has `<Label>` via `components/ui/label.tsx` with `nativeID`/`accessibilityLabelledBy`.
- Merge classes through `cn()`. No inline `StyleSheet.create` for theming.
- Numeric input accepts both `.` and `,` via `lib/format.ts`. No regex duplication.
- Copy rubric (Strava-dry, UX #14): no 2nd-person possessive transformation verbs, no comparison-to-others framing, indicative over imperative for non-critical actions, ≤8 words per display line, no emojis, no exclamations.
- React Compiler: no ref mutations during render, no conditional hooks, stable keys on map outputs.

### Gate decisions + themes that apply
- **UX #1:** segmented 5-dot progress covers S2–S6 only. S1 no progress. S7–S9 no progress (reward phase). Dots collapse S5/S5a/S5b into one segment. Endowed progress: dot 1 lit on S2 entry.
- **UX #14:** Strava-dry rubric committed to `docs/prism/onboarding-flow/copy-rubric.md` (already exists if prior phase landed it; otherwise create).
- **UX #10:** canonical error strings in `lib/copy/errors.ts` — four strings locked.
- **UX #13:** no pre-selected goal card; primary-pin available after first tap; disabled CTA microcopy *"Pick at least one to continue."*
- **UX #2:** S4 header *"Which days can you train this week?"* + sub-caption *"You can change these anytime."* No "commit."
- **UX #4:** S6 three unbundled consents, each with its own checkbox (not pre-checked). Paywall disclosure MOVED OFF S6 to S9.
- **Mobile-A11y #3:** 2-row grid on ≤375pt viewports for S4. `hitSlop`. `onboarding` size variant on Button (48pt).
- **Mobile-A11y #5:** S6 Edit chips include value in label; action in hint. Consent checkbox full-sentence label. Disabled Submit uses `accessibilityState={{ disabled: true }}`, not opacity alone.
- **Mobile-A11y #16:** goal + experience chip labels expand to a full SR sentence (visually "Stronger"; SR reads "Stronger — build strength and muscle").
- **Offline-Sync #1:** S6 uses `useMutation(api.onboarding.completeOnboardingV2)` directly with explicit retry UI. NOT routed through `lib/convex-sync.ts` queue.
- **Security CR2 / Theme D:** Art. 9 fields stay in the in-memory slice (plan-01 contract). Do not add `persist` to them here.
- **Performance #4:** persist-on-blur + 300ms debounce. No write-per-keystroke.
- **Performance #7:** goal card assets — WebP ≤40KB, bundled, `expo-image` with blurhash, decoded ≈ rendered within 2×.

### Files this sub-plan touches
- **New (routes):**
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/_layout.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/goal.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/experience.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/days.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding/consent.tsx`
- **New (components):**
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/progress-dots.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/goal-card.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/experience-chip.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/day-chip.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/consent-row.tsx`
  - `/Users/sebastiansole/Documents/gainsoclock/components/onboarding/intake-summary-list.tsx`
- **New (utilities):**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/copy/errors.ts`
  - `/Users/sebastiansole/Documents/gainsoclock/docs/prism/onboarding-flow/copy-rubric.md` (if not already present from earlier exploration work)
- **Modified:**
  - `/Users/sebastiansole/Documents/gainsoclock/components/ui/button.tsx` — add `onboarding` size variant (h-12, 48pt minimum)
  - `/Users/sebastiansole/Documents/gainsoclock/lib/format.ts` — add comma-decimal parsers for weight/height/age
- **Deleted:**
  - `/Users/sebastiansole/Documents/gainsoclock/app/onboarding.tsx` (the legacy placeholder)
- **Assets:**
  - `/Users/sebastiansole/Documents/gainsoclock/assets/onboarding/goal-stronger.webp`
  - `/Users/sebastiansole/Documents/gainsoclock/assets/onboarding/goal-leaner.webp`
  - `/Users/sebastiansole/Documents/gainsoclock/assets/onboarding/goal-healthier.webp`
  - `/Users/sebastiansole/Documents/gainsoclock/assets/onboarding/goal-routine.webp`
  - (Each ≤40KB, WebP, bundled.)

### Data contracts

**`app/onboarding/_layout.tsx`:**
- Stack layout (Expo Router `<Stack>`) with `header` showing `<ProgressDots current={stepIndex} total={5} />`.
- Step index map: `goal → 0`, `experience → 1`, `days → 2`, `healthkit | healthkit-prefill | manual-stats → 3` (collapsed), `consent → 4`.
- `headerBackVisible: true` on all steps except `consent` (forward-only after final submit).
- Route guard: if `useOnboardingStatus()` returns `"complete"`, redirect to `/onboarding/aha` or `/(tabs)` depending on context.
- Analytics: screen-mount events fire in each screen's `useEffect`, not in the layout. The layout mounts `useRageQuitTracking(pathname)` once.

**`components/onboarding/progress-dots.tsx`:**
```tsx
export function ProgressDots({ current, total }: { current: number; total: number }): JSX.Element;
```
- Renders `total` dots; dots at index `<= current` filled with `bg-primary`, others `bg-muted`.
- `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 1, max: total, now: current + 1 }}`.
- `useReduceMotion()` — if enabled, no fill animation; swap instant.

**S2 goal — `app/onboarding/goal.tsx`:**
- State: `goals: Goal[]`, `primaryGoal: Goal | undefined` — in-memory from `intake-draft-store` (non-special slice; persisted with 300ms debounce).
- Render: heading *"Goal."* + 4 `<GoalCard>` in a 2×2 grid.
- Disabled CTA when `goals.length === 0`; shows microcopy *"Pick at least one to continue."*
- Primary-pin: first tap sets `primaryGoal = tapped`. A small radio next to each selected card re-pins primary; `accessibilityRole="radio"`.
- On `Continue`: persist, `router.push("/onboarding/experience")`, `capture({ name: "goal_set", props: { goals, primaryGoal } })`.
- `<GoalCard>` props: `{ id: Goal; title: string; srDescription: string; selected: boolean; isPrimary: boolean; onSelect: () => void; onPinPrimary: () => void; }`. `accessibilityRole="checkbox"`, `accessibilityState={{ checked: selected }}`, `accessibilityLabel` = `srDescription` (e.g. "Stronger — build strength and muscle").
- Asset via `expo-image` with `contentFit="cover"` + `placeholder={blurhash}`; WebP, ≤40KB.

**S3 experience — `app/onboarding/experience.tsx`:**
- 3 chips: `beginner | returning | experienced`. Literal union from `convex/validators.ts`.
- SR labels: "Beginner — new to training, start slow", "Returning — some training history, coming back after a break", "Experienced — confident with programming, know your ceilings".
- Single-select. On tap → persist + `router.push("/onboarding/days")`.
- Capture `experience_set { experience }`.

**S4 days — `app/onboarding/days.tsx`:**
- Header: *"Which days can you train this week?"*
- Sub-caption: *"You can change these anytime."*
- 7 day chips (Sun–Sat, indices 0–6). Multi-select.
- Viewport-aware layout: use `useWindowDimensions()` — if `width <= 375`, render as 2-row grid (row 1: Sun Mon Tue Wed; row 2: Thu Fri Sat). Else single row. Each chip ≥ 44×44pt via `hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}`.
- Continue disabled when zero selected; microcopy *"Pick at least one day to continue."*
- Capture `days_set { count, weekdays: number[] }`.
- On Continue → `router.push("/onboarding/healthkit")` — the S5 primer (plan-06) is the next stop.

**S6 consent — `app/onboarding/consent.tsx`:**
- Sections:
  1. Intake summary (read-only list of S2–S5 answers from the draft store) — each row has an Edit chip.
  2. Three consent rows via `<ConsentRow>`, each with its own checkbox (not pre-checked).
  3. Sub-processors link → methodology page (plan-07 ships the page; link target `/methodology`).
  4. Submit button — disabled unless `health_data_personalization === true && ai_coach_inference === true`. `analytics` is optional (default off per HealthKit-Privacy C1).
  5. Withdraw promise copy: *"You can withdraw this in Settings anytime."*
- **Paywall disclosure is NOT on this screen** (UX #4). It appears only on S9 (plan-08).
- On Submit:
  1. Compute `consentVersionHash = await computeCombinedHash()` from `lib/consent.ts`.
  2. Call `useMutation(api.onboarding.completeOnboardingV2)` with all draft fields + consents + hash + `clientIntakeId` from the draft store.
  3. On success: `capture({ name: "consent_granted", props: { versionHash, purposes: [...] } })`; `clearDraft()`; `router.replace("/onboarding/analysis")` (plan-07 ships S7).
  4. On failure: show retry UI with error copy from `lib/copy/errors.ts` (`NETWORK_SYNC`). Retry button re-fires the mutation with the same `clientIntakeId` (idempotent per plan-01).
- **Not routed through `lib/convex-sync.ts`.** Use `useMutation` directly.

**`components/onboarding/consent-row.tsx`:**
```tsx
export function ConsentRow({
  purpose, boldLine, finePrint, checked, onToggle,
}: {
  purpose: ConsentPurpose;
  boldLine: string;   // affirmative checkbox label
  finePrint: string;  // Art. 9/28 specificity
  checked: boolean;
  onToggle: () => void;
}): JSX.Element;
```
- Layout: checkbox (`@rn-primitives/checkbox` wrapped in `components/ui/checkbox.tsx`) + bold line text + fine print below.
- `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`, `accessibilityLabel` = full consent sentence including fine print.
- Copy (verbatim from `lib/consent.ts`):
  1. `health_data_personalization`: *"OK, use my weight, height, and workouts on this device to personalise my coach."* Fine print: *"Stored locally and in Fitbull's EU-region Convex database. Not shared with advertisers."*
  2. `ai_coach_inference`: *"OK, send my profile (weight, height, age, training goals) to OpenAI (United States, under Standard Contractual Clauses) so the AI coach can generate my plan."* Fine print: *"Only while generating your plan. OpenAI does not retain the data (30-day zero-retention)."*
  3. `analytics`: *"OK, send anonymous usage analytics to PostHog (Frankfurt, EU) so Fitbull can improve the app."* Fine print: *"No body stats; IP address not captured."*

**Intake-summary list (`intake-summary-list.tsx`):**
- Reads draft store.
- Rows: Goal, Experience, Days, Weight/Height (if data source is healthkit/manual). For Art. 9 rows (weight/height/bodyfat), since they're in-memory, they still render here (user is on S6, draft is still in memory).
- Edit chip per row: `accessibilityLabel="Goal: Stronger"` (value in label), `accessibilityHint="Double-tap to edit"`, `accessibilityRole="button"`. On tap → `router.push("/onboarding/goal")`.

**`lib/copy/errors.ts`:**
```ts
export const ERROR_COPY = {
  NETWORK_SYNC: "Couldn't reach Fitbull. We'll retry in the background — your answers are safe.",
  HEALTHKIT_PERMISSION: "Apple Health didn't respond. Add your stats manually now and try Health later in Settings.",
  AHA_LLM: "Couldn't reach our AI coach — try again in a moment.",
  PAYWALL_SHEET: "Couldn't open the purchase screen. Try again, or skip for now — your plan is waiting.",
} as const;
```
Keys are the only references. Do not interpolate; if a new error surfaces, add a new key.

**`lib/format.ts` additions:**
```ts
/** Parses "82,3" or "82.3" → 82.3. Returns null on invalid. */
export function parseLocaleNumber(input: string): number | null;
/** Weight in kg, bounded 30-250. */
export function parseWeightKg(input: string): number | null;
/** Height in cm, bounded 120-230. */
export function parseHeightCm(input: string): number | null;
/** Age in years, integer, bounded 16-100. */
export function parseAgeYears(input: string): number | null;
```
- `parseLocaleNumber`: `input.replace(",", ".")` → `Number(trimmed)`. Null on `NaN`, empty, or non-numeric.
- Each bounded parser wraps `parseLocaleNumber` + range check.
- Used by S5a/S5b/S6 and any future numeric input.

**`components/ui/button.tsx` variant addition:**
```ts
// extend cva size variants:
size: {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
  onboarding: "h-12 px-6 py-3", // 48pt minimum touch target (Mobile-A11y #3)
}
```
Use `onboarding` size on every Button in `app/onboarding/*`.

**`docs/prism/onboarding-flow/copy-rubric.md`** (if not already present):
```md
# Strava-dry copy rubric (UX #14)
- No 2nd-person possessive transformation verbs ("unleash your potential").
- No comparison-to-others framing ("412 lifters in Norway").
- Indicative over imperative for non-critical actions.
- ≤ 8 words per display line.
- No emojis, no exclamations, no motivational filler.
- Recommend-register verbs preferred ("I'd start with", "Since you").
- Avoid therapy-register ("What brings you here?").
```

### Gotchas (from reviews)

- **Offline-Sync #1:** the S6 mutation is direct, not queued. A common mistake is to route through `lib/convex-sync.ts` "for consistency." Don't.
- **UX #4:** a reviewer will want to put "Your plan is ready — unlock to start Monday" on S6 as a preview. Decline. It lives on S9.
- **UX #13:** no pre-selected goal card. A designer might think pre-selecting the "primary" card improves affordance. The reviews disagree — pre-selection is a nudge, and the primary-pin control is mechanical (first-tapped), not suggestive.
- **Mobile-A11y #3:** the 2-row grid kicks in at `width <= 375`. Test on iPhone SE simulator explicitly — plan-10 has the Maestro profile.
- **Performance #7:** do NOT use `require` for remote URIs; goal cards are bundled. If the implementer is tempted to fetch them, stop.
- **Security CR2 / Theme D:** S6's intake-summary reads Art. 9 fields from memory. They've never left the device. On `clearDraft()` after success, they vanish. Don't trigger a persist cycle here.
- **Convex-Realtime C8:** `consentVersionHash` MUST come from the client at submit — it locks what copy the user saw. Server timestamps (`grantedAt`) are authored inside the mutation (plan-01 contract).
- **React Compiler:** `useMemo` the 4-card array to keep render stable; stable keys per-card via `id`.

## Implementation

1. **Create `lib/copy/errors.ts`.**
   - **What:** per Data contract.
   - **Test:** `npx tsc --noEmit`.

2. **Create/update `docs/prism/onboarding-flow/copy-rubric.md`.**
   - **What:** per Data contract. If the file exists, reconcile — do not overwrite divergent content without review.

3. **Extend `lib/format.ts`.**
   - **What:** add `parseLocaleNumber`, `parseWeightKg`, `parseHeightCm`, `parseAgeYears`.
   - **Approach:** pure functions, no React.
   - **Test:** `npx tsc --noEmit`; dev harness on the four parsers with `"82,3"`, `"82.3"`, `"82"`, `""`, `"abc"`, `"500"` (out of range), `"25"` (for age).

4. **Extend `components/ui/button.tsx`.**
   - **What:** add the `onboarding` size variant.
   - **Approach:** diff-only in the `cva` config.
   - **Test:** `npx tsc --noEmit`; manual — render a button with `size="onboarding"` on iPhone SE simulator; touch target is 48pt tall.

5. **Create `components/onboarding/progress-dots.tsx`.**
   - **What:** per Data contract.
   - **Approach:** map `Array.from({ length: total })`. Stable keys via index. Use `useReduceMotion()` (plan-03 hook) to gate the fill animation.
   - **Test:** `npx tsc --noEmit`.

6. **Create `app/onboarding/_layout.tsx`.**
   - **What:** Expo Router `<Stack>` with the progress dots in the header area. Route guard via `useOnboardingStatus()`. Mount `useRageQuitTracking(pathname)` from plan-03.
   - **Approach:** minimal boilerplate; rely on typedRoutes. Do NOT render screens inline here — each screen is its own file.
   - **Test:** `npx tsc --noEmit`; boot and navigate to `/onboarding/goal` — header shows dots.

7. **Delete `app/onboarding.tsx`.**
   - **What:** remove the legacy placeholder file. Update any Href references to `/onboarding` → `/onboarding/goal` (plan-00 left a `TODO(plan-05)` note; fulfill it here).
   - **Test:** `pnpm lint`; `npx tsc --noEmit`.

8. **Create `components/onboarding/goal-card.tsx`.**
   - **What:** per Data contract.
   - **Approach:** `expo-image` with blurhash placeholder. Selected state overlay via NativeWind class (`"ring-2 ring-primary"` or equivalent). Primary-pin radio rendered when `selected`.
   - **Test:** `npx tsc --noEmit`.

9. **Bundle goal card assets.**
   - **What:** four WebP files, ≤40KB each, under `assets/onboarding/`. Generate or commission; if not available at this phase, use placeholder 1×1 solid-colour WebPs sized to final render dimensions — plan-10 replaces them.
   - **Approach:** use `cwebp` or an online tool; decoded dimensions ≈ rendered dimensions within 2×.
   - **Test:** `stat --format="%s" assets/onboarding/*.webp` — each file ≤ 40000 bytes.

10. **Create `app/onboarding/goal.tsx`.**
    - **What:** per Data contract.
    - **Approach:** read/write draft store for `goals` + `primaryGoal`. Capture `goal_set` on continue (forward-only).
    - **Test:** `npx tsc --noEmit`; manual — select one goal, primary pins to it; select a second, pin still first; tap second goal's pin, primary flips; deselect first → primary flips to remaining.

11. **Create `components/onboarding/experience-chip.tsx`.**
    - **What:** per Data contract.
    - **Test:** `npx tsc --noEmit`.

12. **Create `app/onboarding/experience.tsx`.**
    - **What:** per Data contract. Single-select chips.
    - **Test:** `npx tsc --noEmit`; manual — selecting a chip advances to `/onboarding/days` and persists.

13. **Create `components/onboarding/day-chip.tsx`.**
    - **What:** chip primitive with selected / unselected states + `hitSlop`.
    - **Test:** `npx tsc --noEmit`.

14. **Create `app/onboarding/days.tsx`.**
    - **What:** per Data contract. `useWindowDimensions` — 2-row grid ≤375pt.
    - **Test:** `npx tsc --noEmit`; manual on iPhone SE simulator — verify 2-row layout; every chip hit-slopped to ≥44pt.

15. **Create `components/onboarding/consent-row.tsx`.**
    - **What:** per Data contract. Checkbox primitive from `components/ui/checkbox.tsx` (or create if missing, wrapping `@rn-primitives/checkbox`).
    - **Test:** `npx tsc --noEmit`.

16. **Create `components/onboarding/intake-summary-list.tsx`.**
    - **What:** per Data contract. Edit chips route back to individual screens.
    - **Test:** `npx tsc --noEmit`.

17. **Create `app/onboarding/consent.tsx`.**
    - **What:** per Data contract. Uses `useMutation(api.onboarding.completeOnboardingV2)` directly. Submit disabled until `health_data_personalization && ai_coach_inference`.
    - **Approach:** local `useState` for pending/error; not Zustand. On error, show retry button + `ERROR_COPY.NETWORK_SYNC`. On success, `clearDraft()` + `router.replace("/onboarding/analysis")`.
    - **Analytics:** `consent_granted` on success; `intake_started` is already in the buffer from plan-04, flushed by plan-03's consent gate when `analytics === true`.
    - **Test:** `npx tsc --noEmit`; manual happy path; manual offline — submit, retry, succeed on reconnect; manual server error — submit, retry, error surfaces but draft survives.

18. **Hook up session-replay allowlist.**
    - **What:** plan-03 already registered the allowlist. Verify `goal`, `experience`, `days`, `consent` routes are ON (chrome only on `consent` — `maskAllInputs: true` covers content).
    - **Test:** manual — start a session, walk through intake, inspect PostHog replay: chrome visible, inputs masked.

### Test discipline
- After each screen: `npx tsc --noEmit`; manual route navigation.
- After S6 submit: Convex dashboard shows 1 profile row + 3 consent rows written by the dev user.
- Between screens: draft persistence verified via AsyncStorage inspection (non-Art.9 persisted; Art.9 never present).
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`; Maestro `03-intake-happy.yaml` green (flow scaffolding lives in plan-10; this phase must leave `testID` props).

## Acceptance Criteria

- [ ] Routes: `app/onboarding/_layout.tsx`, `goal.tsx`, `experience.tsx`, `days.tsx`, `consent.tsx` all exist under `app/onboarding/`.
- [ ] Legacy: `app/onboarding.tsx` deleted; no stale `/onboarding` Href references.
- [ ] Progress: `ProgressDots` renders 5 dots; current step highlighted; `accessibilityRole="progressbar"` with correct value.
- [ ] S2: 4 goal cards, no pre-selection, primary-pin radio per selected card, disabled CTA microcopy, `accessibilityRole="checkbox"` on cards, SR labels expanded per UX #16.
- [ ] S2 assets: four WebP files ≤ 40KB each at `assets/onboarding/goal-*.webp`; rendered via `expo-image` with blurhash.
- [ ] S3: 3 experience chips, single-select, SR labels expanded.
- [ ] S4: header and sub-caption verbatim per UX #2; 2-row grid on ≤375pt viewports; every chip effective 44×44pt via `hitSlop`; Button `size="onboarding"` used.
- [ ] S6: intake summary with Edit chips (value in label, action in hint); 3 unbundled consents (none pre-checked); Submit disabled until required pair granted; paywall disclosure NOT on this screen.
- [ ] S6 submit: uses `useMutation(api.onboarding.completeOnboardingV2)` directly; NOT `lib/convex-sync.ts` queue. Retry UI on failure.
- [ ] S6 writes: successful submit creates 1 `userProfile` row + 3 `userConsents` rows in Convex; `consentVersionHash` matches `computeCombinedHash()` of current copy.
- [ ] Button variant: `onboarding` size (h-12) added to `components/ui/button.tsx`.
- [ ] Errors: `lib/copy/errors.ts` exports exactly four keys (`NETWORK_SYNC`, `HEALTHKIT_PERMISSION`, `AHA_LLM`, `PAYWALL_SHEET`).
- [ ] Locale: `lib/format.ts` parses comma- and dot-decimals; bounded parsers reject out-of-range.
- [ ] Analytics: `goal_set`, `experience_set`, `days_set`, `consent_granted` fire on forward-only actions. `intake_started` buffer from plan-04 flushes iff analytics granted.
- [ ] Persistence: non-Art.9 draft fields persist across relaunches; Art.9 fields do NOT (AsyncStorage inspection shows no weight/height/age/sex/bodyfat).
- [ ] Replay: `goal`, `experience`, `days`, `consent` routes start session replay; chrome only (inputs masked).
- [ ] Accessibility: every interactive has `accessibilityLabel` + `accessibilityRole`; 48pt Buttons; consent checkboxes announce full consent sentences.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Maestro: `testID` props in place on primary interactive elements (`goal-card-stronger`, `continue-button`, `consent-checkbox-ai-inference`, etc.). `.maestro/onboarding/03-intake-happy.yaml` runs green (plan-10 owns the flow itself).
- [ ] Manual smoke (happy path): sign in → S2 → pick "stronger" → Continue → S3 → pick "returning" → S4 → pick M/W/F → Continue → S5 family (plan-06) → S6 → consents → Submit → lands on S7 stub (`analysis` route, plan-07).
- [ ] Manual smoke (error): airplane mode on S6 Submit → retry UI shows `NETWORK_SYNC` copy; reconnect; Retry → success; draft clears only on server-confirmed success.
- [ ] Out-of-scope: S5 primer + S5a/S5b (plan-06); S7 analysis + S8 aha + S9 paywall + methodology page (plan-07/08); `app/settings/privacy.tsx` (plan-08).

## Risks

- **Risk:** S6 submit lands but the Convex write fails silently because the mutation was queued via `convex-sync`.
  - **Detect:** manual offline → reconnect test; user reaches S7 without a real profile row.
  - **Mitigate:** enforce direct `useMutation`; reviewer must confirm the code doesn't import from `lib/convex-sync.ts` in `consent.tsx`.
  - **Escalate:** immediate.

- **Risk:** pre-selected goal card creeps back in via a default value.
  - **Detect:** `goals` is non-empty on S2 mount; CTA enabled without user action.
  - **Mitigate:** draft store initialises `goals = []`; test the mount state.
  - **Escalate:** low risk; catch in code review.

- **Risk:** 2-row grid on S4 breaks on iPhone 12 Mini (≤375pt) if `useWindowDimensions` returns stale values during orientation change.
  - **Detect:** manual on iPhone SE simulator and iPhone 12 Mini.
  - **Mitigate:** use `useWindowDimensions()` (reactive). Do not use `Dimensions.get('window')` synchronously at module scope.
  - **Escalate:** if grid layout is still wrong on rotation, hide rotation (portrait-only) — app is already portrait-locked in `app.json`, so rotation is unlikely.

- **Risk:** goal card WebP assets are placeholder and shipped to TestFlight as ugly solid colours.
  - **Detect:** visual review.
  - **Mitigate:** placeholder is acceptable for intra-phase verification; plan-10 replaces with final assets. Document in PR description.
  - **Escalate:** if final assets aren't ready by plan-10, defer by one TestFlight build.

- **Risk:** intake summary on S6 shows stale Art. 9 values because the user navigated back to S2 after entering them on S5a.
  - **Detect:** manual — on S6, tap Edit → Goal → change → Continue back to S6. Summary should refresh.
  - **Mitigate:** summary reads draft store reactively via Zustand selector; no manual refresh needed.
  - **Escalate:** if stale, switch to `useStore` with explicit selectors to force re-renders.

- **Risk:** consent checkbox tap toggles silently without VoiceOver announcement.
  - **Detect:** VoiceOver manual test.
  - **Mitigate:** `accessibilityState={{ checked }}` passed to the primitive; primitive must propagate. Verify via VoiceOver rotor-sweep.
  - **Escalate:** if `@rn-primitives/checkbox` strips the state, implement a custom checkbox that sets `accessibilityState` on the `Pressable`.

- **Risk:** bundled WebP assets inflate the app binary past an arbitrary budget.
  - **Detect:** plan-10's bundle audit.
  - **Mitigate:** 4 × 40KB = 160KB max; negligible.
  - **Escalate:** if final assets come in larger, compress further; 40KB is the hard cap.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green.
4. Maestro `.maestro/onboarding/03-intake-happy.yaml` — runs green (plan-10 assembles; this phase leaves `testID` props).
5. Manual smoke:
   - Full happy path S2→S3→S4→(S5 stub/primer)→S6.
   - iPhone SE layout verified for S4 grid.
   - S6 Submit happy path: 1 profile row + 3 consent rows in Convex.
   - S6 Submit offline: retry UI surfaces; draft survives; success on reconnect.
   - Art. 9 values never written to AsyncStorage (inspect via Flipper or similar).
   - Session replay gating: `goal`/`experience`/`days`/`consent` routes recording; S5 family OFF (plan-06 verifies).
6. VoiceOver smoke: rotor-sweep each intake screen; every interactive announces uniquely.
7. Report diffs.
