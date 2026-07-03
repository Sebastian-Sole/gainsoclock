# Design spike: scoping the rest of the health-data trends surface

**Status**: scoping memo — no implementation authorized by this document
**Planned at**: commit `4c29928`, 2026-07-02
**Author**: advisor/054 agent
**Companion PR**: plan 054 ships one piece of this surface (body-weight
trend in Stats > Overview, `components/stats/body-weight-section.tsx` +
`convex/healthData.ts:listDailyMetrics`) and produces this memo to scope
the rest. Nothing below is built yet.

---

## Why this memo exists

`healthDailyMetrics` (`convex/schema.ts:376`) already stores sleep, resting
heart rate, HRV, steps, body mass, and active energy per day, and
`workoutSets` (`convex/schema.ts:97-118`) already captures per-set RPE and
interval pace/speed. None of it is visualized as a trend anywhere in the
app except the two weekly-review averages
(`convex/weeklyReview.ts:319-341`) and the body-weight card this plan adds.
Building all of it in one PR would be an M–L, multi-surface change; this
memo enumerates the pieces so each can become its own right-sized plan.

---

## 1. Recovery trends (sleep, RHR, HRV, steps)

**Data**: `healthDailyMetrics.asleepSeconds`, `.restingHeartRateBpm`,
`.hrvMs`, `.steps` — all optional, all populated only for HealthKit-import
users (`lib/healthkit.ts` health-data-mesh pipeline). Non-HealthKit users
(the majority pre-import-toggle) will have zero rows here — same
empty-state shape the body-weight card handles (`components/stats/body-weight-section.tsx`
returns `null` on zero points).

**Query**: reuse the pattern this plan ships —
`convex/healthData.ts:listDailyMetrics` already returns all six metric
fields per day (not just `bodyMassKg`), range-capped at 400 days
(`MAX_METRICS_RANGE_DAYS`). No new query needed; a recovery-trends plan can
call the same query and pick different fields out of the same rows the
body-weight card already fetches. If a future plan wants a *different*
window (e.g. 365 days for a "sleep trend over the year"), it stays within
the existing 400-day clamp — no schema or query change required unless
someone wants more than ~13 months.

**Placement**: two candidates —
- **New 5th Stats tab** ("Recovery" alongside History/Overview/Exercises/Records,
  `app/(tabs)/stats.tsx:90-103`) — cleanest separation, but adds a
  permanent tab that's empty for every non-HealthKit user (majority of
  users pre-import). Needs an empty-state screen, not just a hidden section.
- **Overview sections** (alongside `BodyWeightSection`) — consistent with
  how this plan placed body weight: sections that return `null` compose
  away silently for non-HealthKit users. Cheaper, more consistent with the
  "renders nothing when absent" convention already established.

  Recommendation: Overview sections, one per metric or one combined
  "Recovery" card (sleep + RHR + HRV together, steps separately since it's
  a different axis/scale). Revisit the tab question only if Overview gets
  crowded (it will have Weekly Review entry, Totals, Yearly, Streaks,
  Averages, Body Weight, plus this — six-seven sections deep already).

**Gaps handling**: HealthKit-import users still have sparse data — sleep
tracking requires a worn device overnight, RHR/HRV need a wearable that
supports those types. A recovery-trends component must handle "some days
present, most absent" as the *normal* case, not an edge case — unlike body
weight (one manual/scale entry can populate a day), these are
device-dependent and often mostly-empty even for opted-in users. The
sparkline approach in `body-weight-section.tsx` (`Sparkline`, filters
non-null points before drawing) generalizes, but a recovery chart should
probably show "X of last 30 days have sleep data" as an explicit stat
rather than silently thin the chart the way body weight does.

**Size**: M (four metrics × placement decision × gap-heavy UX, versus S for
body weight's single metric with denser typical data).

---

## 2. RPE / intensity charts

**What `lib/stats.ts` computes today** (verified — `grep -n "rpe" lib/stats.ts`
returns nothing): zero RPE awareness. `computeExerciseStats` (`lib/stats.ts:161`)
accumulates `totalWeight`/`totalReps`/`totalTime`/`totalDistance` per set
type and tracks personal bests (`maxWeight`, `maxReps`, `maxTime`,
`maxDistance`, `maxVolume` — `lib/stats.ts:59-64`). None of these read
`set.rpe`.

**What an RPE extension needs**:
- **Avg session RPE**: per `workoutLog`, average `rpe` across sets that
  have it set (`workoutSets.rpe` is `v.optional(v.number())` —
  `convex/schema.ts:109` — so many historical sets will have no value,
  especially from before `rpeEnabled` was turned on for a given user).
  Trend this over time the same shape as the body-weight sparkline:
  date → value, non-null points only.
- **Per-exercise RPE trend**: extend `ExerciseStats`
  (`lib/stats.ts:49-65`) with an optional `avgRpe`/`rpeTrend` field,
  computed the same loop that already walks `exercise.sets` in
  `computeExerciseStats` (`lib/stats.ts:161-236`) — cheap to add since the
  iteration already exists, just needs an accumulator.

**Gating requirement**: `rpeEnabled` is a per-user client setting
(`stores/settings-store.ts:42`, default `false` — `:127`), read via
`useSettingsStore((s) => s.rpeEnabled)` and used to conditionally render
`RpeInput` in `components/workout/set-row.tsx:27,152` and the active/detail
workout screens (`app/workout/active.tsx:99,450`,
`app/workout/[id].tsx:30,426`). An RPE chart must hide (not just show
empty) when `rpeEnabled` is `false` — a user who never turned RPE on
shouldn't see a confusing "RPE trend: no data" card; they should see
nothing, mirroring how `set-row.tsx` hides the input itself rather than
showing a disabled one.

**Size**: S–M. The stats-computation extension is small (one more
accumulator in an existing loop); the gating + empty-state design is the
larger fraction of the work.

---

## 3. Interval pace records

**Data**: `workoutSets` interval-type fields — `variant` (`"work"|"rest"`),
`metric` (`"pace"|"distance"|"speed"`), `paceSeconds`, `speed`,
`distanceUnit` (`convex/schema.ts:110-117`). `lib/format.ts:82`
(`formatPace`) already exists to render `paceSeconds`, so display
formatting is solved; only the aggregation/records layer is missing.

**Records tab's current shape**: weight-centric. `RecordsSection`
(`components/stats/records-section.tsx`) renders `bestMonth`, `bestYear`,
and `FavoriteStats` (most-used exercise, favorite template, most-active
day/hour) — no per-exercise personal-best row rendering at all in Records
(`ExerciseStats.maxWeight`/`maxReps`/`maxTime`/`maxDistance`/`maxVolume`
are consumed by `exercises-tab.tsx`, not `records-tab.tsx` — verified:
`records-tab.tsx` only passes `bestMonth`/`bestYear`/`favorites` to
`RecordsSection`).

**Correction to what's actually missing** (verified against
`lib/stats.test.ts:146-160`, the characterization test for intervals): it
is *not* true that interval sets contribute nothing today. Per plan 011
(pinned by that test), a work-variant interval set already feeds
`totalTime` (its `time` field), `totalDistance` (when
`metric === 'distance'`), and — because the PB checks in
`computeExerciseStats` are generic `'field' in set` guards, not
type-narrowed to specific set types — `maxTime` and `maxDistance` too
(`lib/stats.ts:224-233`). Rest-variant intervals correctly contribute
zero. What's genuinely missing is anything keyed on `paceSeconds` or
`speed` specifically: `ExerciseStats` has no `maxSpeed`/`bestPaceSeconds`
field (`lib/stats.ts:49-65`), and grep confirms neither field is read
anywhere in `lib/stats.ts` or `components/stats/`. So the gap is
narrower than "intervals do nothing" — it's "pace/speed are captured and
displayable (`formatPace`) but never turned into a record."

**What's needed**: a new PB category for pace/speed — and pace inverts the
usual "max wins" comparison (a *lower* `paceSeconds` is the personal best,
unlike every other `max*` field), so this isn't just adding a field, it's
adding a `min`-comparison PB alongside all the existing `max`-comparison
ones. Also needs a decision on whether interval PBs live in
`exercises-tab.tsx`'s per-exercise view (where the other maxes already
render — `components/stats/exercises-tab.tsx:112-158`, which already
renders `maxTime`/`maxDistance` as "Longest"/"Furthest" — meaning a
work-variant interval set's time/distance is already silently mixed into
those two PB rows today, indistinguishable from a `time_distance`-type
set's PB) or a new Records row; given Records is timeframe/favorites-shaped
today (not per-exercise), the natural home is `exercises-tab.tsx`,
consistent with the other PB fields.

**Size**: S–M — the totals/PB plumbing for `time`/`distance` already
exists (plan 011); this is adding one new min-comparison PB field plus a
display slot, not building the intervals branch from scratch.

---

## 4. Dietary write-back to Apple Health

**OPERATOR DECISION REQUIRED — do not build this without a privacy-copy
and legal review.** This section is evidence-gathering only.

**Current write scope** (`lib/healthkit.ts:60-63`):
```ts
export const HEALTHKIT_WRITE_SCOPES = [
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKWorkoutTypeIdentifier',
] as const;
```
Workouts are written via `saveWorkoutToHealthKit` (`lib/healthkit.ts:212-247`);
logged nutrition is never written today (verified: no
`DietaryEnergyConsumed`/`DietaryProtein`/etc. identifiers anywhere in the
file).

**The scope-lock process** (`lib/healthkit.ts:1-10`, quoted in full since
this is exactly the gate this feature must pass through):
> "Scope set locked per app.json NSHealthShareUsageDescription /
> NSHealthUpdateUsageDescription. Changing this requires a legal + copy
> update (HealthKit-Privacy CR4)... Writes: ActiveEnergyBurned,
> WorkoutType. Never add age, sex, cycle, or labs reads here without a
> matching plist + review update."

Dietary write-back needs four **new** write scopes:
`HKQuantityTypeIdentifierDietaryEnergyConsumed`,
`HKQuantityTypeIdentifierDietaryProtein`,
`HKQuantityTypeIdentifierDietaryCarbohydrates`,
`HKQuantityTypeIdentifierDietaryFatTotal`. Per the quoted process, this is
a HealthKit-Privacy CR (same family as CR4) — legal + copy sign-off is a
precondition, not a follow-up.

**Permission re-prompt implications**: adding write scopes to
`HEALTHKIT_WRITE_SCOPES` means every existing HealthKit-enabled user needs
a fresh authorization request for the new types — iOS shows a new sheet
listing the added identifiers. This is user-facing even for existing
users who already granted the current scopes; it isn't a silent
capability add.

**`NSHealthUpdateUsageDescription` copy**: current copy
(`app.json:18,71`) — "Fitbull writes your completed strength workouts and
estimated active energy to Apple Health so they count toward your Fitness
rings." — describes only workouts/energy. A dietary write-back needs this
string rewritten to disclose the new writes (Nutrition category data),
which is exactly the copy-review trigger the scope-lock comment requires.

**Dedupe via authored-sample lifecycle**: the existing pattern
(`saveWorkoutToHealthKit` stamps `{ HKExternalUUID: log.id }` at write
time — `lib/healthkit.ts:239`; `deleteAuthoredSamples`
(`lib/healthkit.ts:608-634`) removes everything Fitbull authored, keyed by
type identifier, on account deletion) is the template to reuse: dietary
samples would need the same `HKExternalUUID` stamp (keyed to the meal
log's id) so (a) re-syncs don't duplicate entries and (b) account deletion
cleanup (`deleteAuthoredSamples`) can extend its `identifiers` array to
include the new dietary types.

**Where it would hook**: `stores/meal-log-store.ts:78` — `addMeal`'s
`syncToConvex(api.mealLogs.logMeal, ...)` call is the chokepoint every
manual/photo/barcode log path already flows through
(confirmed by the store's own comment at `stores/meal-log-store.ts:52-55`:
"every code path that changes today's meal logs flows through this
store"). A write-back call would sit next to that `syncToConvex` call,
same call site, guarded by `Platform.OS === 'ios'` and an enabled-check
the same shape as `isHealthKitAvailable() && isEnabled()` guards already
used in `saveWorkoutToHealthKit`/`getLatestBodyWeight`.

**Size**: M for the code (mirrors the existing workout-write pattern
closely), but gated on an L, non-engineering precondition (legal + privacy
copy review) that has no estimate here.

---

## 5. Charting approach: hand-rolled Views vs. a library

**Current state**: zero charting dependency. `yearly-overview-section.tsx`
uses `Progress` (a single bar); the new `BodyWeightSection`'s `Sparkline`
is a `flex-row` of `View`s with `style={{ height }}` — proportional bars,
no axes/gridlines/tooltips, `accessibilityElementsHidden` since it's
decorative (the stat-card numbers carry the actual info).

**Recommendation: stay hand-rolled through the recovery-trends and
RPE-chart plans (§1–2); revisit only if a plan needs interactivity**
(tooltips on tap, pinch-zoom, multi-series overlay) that a `View`-based
sparkline genuinely can't do. Reasoning:

- Every trend needed by §1 and §2 is a single-series time trend where
  "latest value + direction" is the information that matters (same shape
  as body weight) — a bar/line sparkline covers this.
- **Bundle-cost precedent** (`docs/perf/baseline.md:38-46`): plan-027
  hypothesized the lucide icon barrel was a meaningful bundle cost at
  MED confidence, then *measured* it (removing the catalogue import moved
  the bundle ≤ 2 KB gz) and found the hypothesis wrong — "Metro already
  excludes unused icons." The lesson this memo carries forward: **any
  proposal to add a charting library must ship with a measurement plan**
  (before/after `npx expo export --platform ios` + gzip, per
  `docs/perf/baseline.md:24-27`), not a bundle-size guess. A typical RN
  charting lib (`react-native-svg`-based, e.g. `victory-native` or
  `react-native-gifted-charts`) pulls in `react-native-svg` as a peer
  dependency — that's a real native-module addition (pod install, iOS
  rebuild), not a pure-JS cost, so the "≤ 350 KB gz" bundle acceptance bar
  in `docs/perf/baseline.md:36` is only part of the cost; native build
  time and `expo prebuild` surface area are the other part.
- If a future plan needs true interactivity, propose the library **with**
  a measured before/after bundle delta and a native-rebuild smoke test,
  not before.

**Size**: N/A — this is a standing recommendation, not a plan-sized item.
Re-litigate only when a specific chart's requirements outgrow `View`s.

---

## Summary table

| # | Topic | Size | Blocked on |
|---|---|---|---|
| 1 | Recovery trends (sleep/RHR/HRV/steps) | M | Overview-vs-tab placement call |
| 2 | RPE / intensity charts | S–M | none — `rpeEnabled` gating is well-understood |
| 3 | Interval pace records | S–M | Records-vs-Exercises-tab placement call |
| 4 | Dietary write-back | M code / L precondition | **Legal + privacy-copy review (operator)** |
| 5 | Charting approach | N/A (standing guidance) | Re-open only if hand-rolled fails a concrete need |

**Follow-ups this memo feeds**: a recovery-trends plan, an RPE-charts plan,
and a dietary-write-back plan (privacy-gated). None should start before
the operator has read §4 and made the legal/copy call.
