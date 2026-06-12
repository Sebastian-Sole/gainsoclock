# Design spike: user data export (GDPR portability + trust feature)

**Status**: decision pending — see open questions  
**Planned at**: commit `4500535`, 2026-06-12  
**Author**: advisor/028 agent

---

## 1. Goals / non-goals

### Goals

- **GDPR Art. 20 portability** — give EU users a machine-readable copy of
  personal data they provided or generated (workouts, nutrition, health
  metrics, chat history, profile, consents). This is a legal expectation
  for an EU-targeted app already shipping PostHog EU and a consent stack.
- **Churn-trust signal** — "I can take my data with me" lowers sign-up
  friction (competitors Strong and Hevy both offer CSV export). A user who
  can export is less locked in, which paradoxically increases trust and
  long-term retention.
- **Support tooling** — an export bundle gives support and the user a
  shared ground truth when debugging sync issues.

### Non-goals

- **Backup / restore** — the Convex backend is the authoritative store;
  export is read-only portability, not a recovery mechanism. Restoring an
  export file is out of scope for this spike.
- **Real-time sync to external services** — e.g. webhook to Google Sheets.
  This design is about on-demand user-initiated export only.
- **Admin / bulk export** — operator-side data pulls are handled through
  Convex dashboard and are not part of this feature.

---

## 2. Scope matrix

Cross-check: `grep -c "defineTable" convex/schema.ts` → 24 (import line)
→ 23 actual tables. Every table is classified below.

| # | Table | Category | Export decision | Rationale |
|---|---|---|---|---|
| 1 | `exercises` | User content | **include-always** | User's custom exercise library |
| 2 | `templates` | User content | **include-always** | Workout blueprints created by user |
| 3 | `templateExercises` | User content | **include-always** | Join: template → exercise order + config |
| 4 | `workoutLogs` | User content | **include-always** | Completed workout history — core portability |
| 5 | `workoutLogExercises` | User content | **include-always** | Exercises performed per workout |
| 6 | `workoutSets` | User content | **include-always** | Set-level data (reps, weight, RPE) |
| 7 | `recipes` | User content | **include-always** | Recipes created or saved by user |
| 8 | `mealLogs` | User content | **include-always** | Daily nutrition log |
| 9 | `nutritionGoals` | User content | **include-always** | Daily macro targets |
| 10 | `workoutPlans` | User content | **include-always** | AI-generated or user-built plans |
| 11 | `planDays` | User content | **include-always** | Individual days within a plan |
| 12 | `externalWorkouts` | User content | **include-always** | HealthKit-sourced workouts (Art. 9 health data) |
| 13 | `healthDailyMetrics` | User content | **include-always** | Sleep, HRV, steps, body mass (Art. 9 health data) |
| 14 | `weeklyReviews` | User content | **include-always** | AI coach weekly review narrative + stats |
| 15 | `userSettings` | User content | **include-always** | Preferences (units, rest timer, notifications) |
| 16 | `chatConversations` | User content | **include-on-request** | AI chat history — sensitive (may contain health disclosures); user should opt-in per export |
| 17 | `chatMessages` | User content | **include-on-request** | Chat message bodies; same reason as above |
| 18 | `userProfile` | User content | **include-on-request** | Goals, body metrics, archetype — Art. 9 health data; include when user selects "profile" scope |
| 19 | `userConsents` | Audit | **include-on-request** | Append-only consent log; technically the user's own record but rarely needed; include as a "legal records" optional scope |
| 20 | `userOnboarding` | Operational | **exclude** | Binary flag (`hasCompletedOnboarding`) — no meaningful portability value |
| 21 | `userSubscriptions` | Billing | **exclude** | RevenueCat is authoritative; the copy here is a local mirror. Exporting it could mislead the user into thinking it's their billing record |
| 22 | `onboardingAha` | Transient | **exclude** | Ephemeral AI streaming buffer; status `streaming/complete/failed` and a `profileSnapshot` string — no durable user-authored content |
| 23 | `aiSafetyIncidents` | Internal moderation | **exclude** | Internal audit log (moderation flags, refusals). Sharing with the subject would reveal system internals and invite circumvention |

**Deletion-coverage note**: `convex/user.ts:255-270` (`deleteAllData`) omits
7 tables vs. the schema — `userProfile`, `userConsents`, `onboardingAha`,
`aiSafetyIncidents`, `externalWorkouts`, `healthDailyMetrics`,
`weeklyReviews`. The export design enumerates from the schema (above), not
from that list. Plan 026's deletion-coverage work should reference this
matrix as the canonical per-user-table inventory.

---

## 3. Formats

### 3a. JSON (primary Art. 20 artifact)

Envelope:

```json
{
  "exportedAt": "2026-06-12T14:00:00Z",
  "appVersion": "1.0.0",
  "user": { "id": "...", "email": "..." },
  "tables": {
    "exercises": [...],
    "workoutLogs": [...],
    "workoutLogExercises": [...],
    "workoutSets": [...],
    ...
  }
}
```

- Lossless: all schema fields included, Convex `_id` and `_creationTime`
  stripped (internal IDs have no portability value; `clientId` is the
  stable user-facing key).
- Suitable for Art. 20 "commonly used, machine-readable format" requirement.

**Size estimate (heavy user assumption)**:
- 3 years of training, 4 sessions/week, avg 5 exercises × 4 sets = ~2,500
  workoutLogs + ~12,500 workoutLogExercises + ~50,000 workoutSets.
  At ~300 bytes/set JSON → ~15 MB for workout data alone.
- Chat: 1,000 conversations × avg 30 messages × ~500 bytes/message → ~15 MB.
- Health metrics: 3 years × 365 days × ~200 bytes → ~200 KB.
- **Total full export estimate: 30–40 MB** (uncompressed).
- Convex action return-value limit is in the low single-digit MB range.
  A single action returning everything will exceed the limit for heavy
  users. See assembly section.

### 3b. CSV (workouts only, FitNotes-compatible)

Columns matching `lib/import/fitnotes.ts:11-28` (`FitNotesRow` interface):
`Name, StartTime, EndTime, BodyWeight, Exercise, Equipment, Reps, Weight, Time, Distance, Status, IsWarmup, RPE, RIR, Categories, Note`

- Maps directly to the importer: a CSV exported by Fitbull will round-trip
  through `parseFitNotesCSV` (lib/import/fitnotes.ts:78-116) and
  `buildWorkoutLogs` (lib/import/fitnotes.ts:123-203) — a free acceptance
  test for the export.
- `BodyWeight` → not currently stored per-workout in the schema; emit
  empty string. `Equipment`, `IsWarmup`, `RIR`, `Categories` → not in
  schema; emit empty string. Preserves FitNotes column order.
- `Status` → emit `"Done"` for `completed: true` sets (importer checks
  `row.Status === "Done"` at line 168).

**Size estimate (heavy user)**: 50,000 sets × ~200 bytes/row CSV → ~10 MB.
That is well above what `Share.share({ message })` can handle on iOS
(practical limit ~1–2 MB before share sheet stalls). See transport options.

---

## 4. Assembly

### Problem

Convex action return values have a size limit (approximately 1–4 MB;
the exact limit is not documented in public Convex docs, but practical
experience puts it at a few MB). A 30–40 MB JSON export cannot be returned
from a single action.

### Option A: per-domain actions (recommended)

Mirror the enumeration pattern in `convex/user.ts:187-204`
(`deleteUserDataBatch`). Create one internal query per domain:

```
convex/exportActions.ts
  exportWorkouts(ctx, userId)   → JSON string (workoutLogs + logExercises + workoutSets)
  exportNutrition(ctx, userId)  → JSON string (mealLogs + recipes + nutritionGoals)
  exportPlans(ctx, userId)      → JSON string (workoutPlans + planDays)
  exportExercises(ctx, userId)  → JSON string (exercises + templates + templateExercises)
  exportHealthMetrics(ctx, userId) → JSON string (externalWorkouts + healthDailyMetrics + weeklyReviews)
  exportProfile(ctx, userId)    → JSON string (userProfile + userSettings)
  exportChat(ctx, userId)       → JSON string (chatConversations + chatMessages) [optional scope]
  exportConsents(ctx, userId)   → JSON string (userConsents) [optional scope]
```

The client calls each action sequentially, collects the JSON strings, and
assembles the final envelope in memory before writing to disk. Each action
stays comfortably below the return-value limit (workouts at ~15 MB is still
over the limit — see note below).

**Note on workout payload size**: if 50,000 sets at ~300 bytes each = 15 MB,
`exportWorkouts` will also exceed the action limit for a heavy user.
Recommendation: paginate `exportWorkouts` via a `cursor` argument (same
pattern as `deleteUserDataBatch` using `.take(BATCH_SIZE)`), emitting
batches of 5,000 sets. The client collects and concatenates.

### Option B: single chunked action

One action that accepts a `table` argument and a `cursor`, returns a
partial payload, and the client loops. More bookkeeping on the client side,
less code on the server side. Not recommended: it pushes assembly logic
into the client and obscures the domain boundaries.

**Recommendation: Option A** (per-domain actions). Each action is
independently testable and aligns with how `deleteAllData` is structured.

---

## 5. Transport options

The app currently has no `expo-file-system` or `expo-sharing` dependency.
The only file-to-share precedent is `react-native-view-shot` writing a PNG
tmpfile and passing its URI to `Share.share({ url })` — see
`app/achievements/index.tsx:57-64`.

### Option A: `expo-file-system` + `Share.share({ url })` (recommended)

1. Add `expo-file-system` (`expo install expo-file-system`).
2. Assemble the export string in memory (client calls per-domain actions).
3. Write to `FileSystem.cacheDirectory + "fitbull-export-YYYY-MM-DD.json"`.
4. Call `Share.share({ url: fileUri })` — iOS/Android share sheet handles
   the rest (AirDrop, Files, email, etc.).

Pros:
- Best UX — the share sheet handles all destinations, including saving to
  Files app, emailing, etc.
- Handles large files correctly (the OS streams the file, not the JS
  string).
- `expo-file-system` is an official Expo module, no native-build risk.
- One new dependency (`expo-file-system`), small, well-maintained.

Cons:
- One additional dependency.
- Requires `expo prebuild --clean` for a new native module (but
  `expo-file-system` is included in Expo Go — it may already be available
  in the dev client without a fresh prebuild, depending on the Expo SDK
  version).

### Option B: `Share.share({ message })` for small CSV only

No new dependency. Passes the CSV string directly as the message field.

Pros: zero dependency.
Cons:
- Hard limit ~1–2 MB in practice; fails silently or crashes the share
  sheet for a heavy user's workout history (~10 MB CSV).
- Not suitable for JSON export.
- Only viable as a phase-1 quick win for workouts-only CSV with a
  size guard.

### Option C: server-side email via Resend (`convex/email.ts`)

The Resend integration already exists (`convex/email.ts`). An action could
assemble the export and send it as an attachment or download link to the
user's email.

Pros:
- No client-side file dependency.
- Works regardless of file size (Resend can host attachments or link to
  a Convex storage object).

Cons:
- Emails PII and Art. 9 health data. Requires a data retention policy for
  the email provider (Resend). The email is a copy outside the app's
  data boundary.
- Async UX ("check your email") vs. immediate download — worse for trust.
- Adds Resend attachment volume / cost.
- Would require disclosure update in `docs/privacy-nutrition-label.md`.

**Recommendation: Option A** (`expo-file-system` + `Share.share({ url })`).
One small new dependency; correct behavior at any size; best UX. Option B
is acceptable only as phase-1 scope (CSV, <1 MB, with explicit size check).

---

## 6. Surface

The export entry point belongs in the **DATA** section of Settings
(`app/settings/index.tsx`), between the "Import Data" row (line 659) and
the "Reset Data" row (line 673):

```
DATA
  Import Data          →  /import
  Export my data       →  [new] triggers export flow
  Reset Data           →  modal
```

**Export flow design:**

1. User taps "Export my data" row.
2. Bottom sheet or modal presents scope picker:
   - Workout data (always checked)
   - Nutrition & recipes (always checked)
   - Health metrics (always checked; Art. 9 warning shown)
   - Profile (opt-in)
   - Chat history (opt-in)
   - Consent records (opt-in, labelled "Legal records")
3. Format picker: JSON (complete) | CSV (workouts only).
4. "Export" button → loading state while actions run → `Share.share`.
5. On cancel or error, dismiss with toast.

The Lucide `Upload` or `Share2` icon is available in `lucide-react-native`
(already installed). The `Download` icon is already imported in
`app/settings/index.tsx:14`.

**Dedicated screen vs. modal**: a dedicated route
`app/settings/export.tsx` is preferred over a modal because the scope
picker and progress state add enough complexity to warrant its own screen.
Pattern matches `/settings/notifications` (line 488).

---

## 7. Privacy notes

- `externalWorkouts`, `healthDailyMetrics`, `weeklyReviews`, and
  `userProfile` (body metrics) are **Art. 9 health data**. The export
  flow must display explicit copy before the user shares: "This export
  contains health data. Only share it with trusted apps or people."
  This mirrors the incremental-authorization pattern already used for
  HealthKit import in `app/settings/index.tsx:239-256`.
- **PostHog analytics event**: fire `export_initiated` with properties
  `{ format: "json" | "csv", scopes: string[] }` — no payload data, no
  user identifiers beyond what PostHog injects automatically. Mirrors
  the consent-event pattern.
- `docs/privacy-nutrition-label.md` may need a disclosure update:
  under "Data Not Collected" or "Data Collected but Not Transmitted" —
  exporting writes data to the device's share sheet, which may transmit
  it to third-party destinations chosen by the user. This is user-directed
  disclosure, not app-directed collection, so it is likely not a new
  App Store Privacy category. Confirm with the operator.

---

## 8. Open questions for the operator

1. **Transport choice**: Option A (`expo-file-system`, one new dep) vs.
   Option B (message-only CSV, no dep, limited scale). This gates the
   build plan significantly.

2. **Include chat history by default?** Chat messages may contain sensitive
   health disclosures. The design puts chat in "include-on-request" (opt-in
   scope). Does the operator agree, or should chat be opt-out?

3. **Rate-limit**: should export be limited to once per N hours to prevent
   automated scraping via a compromised account? Suggested: 1 export per
   24 hours per user (server-enforced in the Convex action via a timestamp
   check on `userProfile` or a dedicated `lastExportAt` field).

4. **Privacy nutrition label update**: does exporting via the share sheet
   (Option A) require a new disclosure in `docs/privacy-nutrition-label.md`?
   The operator should confirm with legal/App Store Review before shipping.

5. **CSV column gaps**: `BodyWeight`, `Equipment`, `IsWarmup`, `RIR`, `Categories`
   are FitNotes columns with no Fitbull schema equivalent. Emit empty
   strings for round-trip compatibility. Is there any objection to this
   approach (e.g., does it mislead users who import the file back in)?

6. **Phase 2 scope**: does the operator want to include `weeklyReviews`
   narratives and `healthDailyMetrics` in a default export, given they are
   Art. 9 data? The design defaults them to include-always with a
   confirm-before-share prompt, but they could be opt-in instead.

---

## 9. Build estimate (phased)

### Phase 1: CSV workouts only via Option B (S — 2–3 days)

Suitable if the operator chooses Option B transport or wants a quick win
before committing to `expo-file-system`.

Files to create / modify:

| File | Change |
|---|---|
| `convex/exportActions.ts` (new) | `exportWorkoutsCSV` action — queries `workoutLogs`, `workoutLogExercises`, `workoutSets`, `exercises`; builds FitNotes-compatible CSV string |
| `app/settings/index.tsx` | Add "Export my data" row to DATA section (after Import Data, line 671) |
| `convex/_generated/*` | Regenerated by Convex CLI (no manual edit) |

Size guard: the action should count rows before assembling; if estimated
CSV size > 800 KB, return an error asking the user to use JSON format
(which requires phase 2). The client surface shows a toast.

### Phase 2: Full JSON export via Option A (M — 1 week)

Files to create / modify:

| File | Change |
|---|---|
| `convex/exportActions.ts` (extend) | Per-domain export actions (see assembly section); paginated `exportWorkouts` with cursor |
| `app/settings/export.tsx` (new) | Export screen: scope picker + format picker + progress + Share |
| `app/settings/_layout.tsx` | Add `/settings/export` route |
| `app/settings/index.tsx` | Route to `/settings/export` instead of inline trigger |
| `package.json` | Add `expo-file-system` (via `expo install`) |
| `docs/privacy-nutrition-label.md` | Confirm / update disclosure if required |

Both phases share the same Convex action file. Phase 1 merges cleanly
into phase 2 — the CSV action stays in `exportActions.ts` and the JSON
actions are added alongside it.

---

*Table count check*: 23 tables classified above (1–23). Schema has 23
`defineTable` calls (`grep -c "defineTable" convex/schema.ts` → 24 minus
the import at line 1 = 23). All tables accounted for.
