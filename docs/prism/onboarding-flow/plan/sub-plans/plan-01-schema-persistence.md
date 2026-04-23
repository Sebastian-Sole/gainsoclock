# Sub-Plan 01: Schema & Persistence

## Dependencies
- **Requires:** plan-00 (legacy onboarding store deleted; entitlement constant centralised; model abstraction in place; reactive onboarding-status hook exists so this phase can wire its read to the real tables).
- **Blocks:** plan-02 (subscription state machine extends `userSubscriptions` and reuses `subscriptionStatusValidator`), plan-04 (auth guard + SIWA collision branch depends on `completeOnboardingV2`), plan-05 (intake screens call `completeOnboardingV2`), plan-06 (HealthKit primer writes profile fields via the same mutation), plan-07 (aha action reads `userProfile` + `userConsents` and writes `onboardingAha` rows), plan-08 (Settings privacy UI reads `getConsents` + calls `withdrawConsent` + `deleteAccount`).

## Objective
Stand up the Convex schema, validators, and persistence mutations that the entire intake flow writes into. This phase delivers four new tables (`userProfile`, `userConsents` append-only, `onboardingAha`, `aiSafetyIncidents`), extends `userSubscriptions` with the V2 state-machine columns, ships the atomic `completeOnboardingV2` mutation with sanity bounds + 16+ gate + `clientIntakeId` idempotency + server-authored timestamps, introduces the consent copy-version hasher, and wires the intake-draft Zustand store with the Art. 9 in-memory / non-Art. 9 persisted split. Everything later phases write through.

## Context

### Stack facts (apply throughout)
- **Convex:** backend is `convex/*.ts`. `convex/` has its own `tsconfig.json`; typecheck via `pnpm convex:dev` (NOT root `tsc`). Use relative imports inside `convex/`; app code imports from `@/convex/_generated/*`.
- **Package manager:** pnpm. `pnpm add <pkg>` — never `npm i`.
- **Runtime:** Expo SDK 54, React 19, React Compiler on. The client-side intake-draft store slice in this phase is plain Zustand with `persist` — compiler-safe as long as you don't mutate refs during render.
- **Path alias:** `@/*` in app code. Validators in `convex/validators.ts` are the single source of truth for enum-ish fields; import and reuse, don't duplicate.

### Coding conventions that apply here
- No `enum`. Use `v.union(v.literal(...))` in Convex; literal unions in TS.
- No `any`. The one scheduled exception is `onboardingAha.workout: v.optional(v.any())` — this is deliberate (full-JSON overwrite each streaming tick, parsed client-side only on completion). Do not propagate `any` outward from that field.
- Every public Convex query/mutation/action opens with `const userId = await getAuthUserId(ctx); if (!userId) throw new Error("Not authenticated");`. `userId` is NEVER a client-supplied argument. Internal mutations (called from actions or crons) may accept `userId: v.id("users")`.
- Indexes are declared in `schema.ts`. If a query filters by a field, add the index before merging.
- `AsyncStorage` for the persisted draft slice; `expo-secure-store` is NOT needed here (no secrets).

### Gate decisions + themes that apply
- **Theme I (streaming architecture):** `onboardingAha` is a dedicated table, NOT a column on `chatConversations`. `generationId` is client-sent nanoid; 250ms throttle; full-overwrite each tick; consumer uses `useQuery(api.onboarding.getAha, { generationId })` (plan-07 ships the consumer).
- **Theme J (subscription state machine):** `userSubscriptions` extension happens here so plan-02 can rewrite the webhook without blocking on schema drift.
- **Security CR4:** `userConsents` is append-only — every grant, withdrawal, and copy-version bump is a new row. `withdrawConsent` appends `granted: false`. Latest-per-purpose read is a reduction over the `by_user_purpose_grantedAt` index.
- **Offline-Sync #1 + Convex-Realtime C8:** `completeOnboardingV2` is an **interactive `useMutation`** — NOT routed through `lib/convex-sync.ts`. The queue's fire-and-forget error swallowing would leave the user stuck. Retry UI lives on the S6 screen (plan-05).
- **AI-Safety #4 + #7:** sanity bounds + 16+ age gate enforced server-side (typed errors on out-of-range). Client also enforces, but the server is authoritative.
- **Security CR5 / AI-Safety #3:** `goalValidator` is a literal union, not a free-form string. `goals[]` array capped at length 4 in the mutation body. Profile passed to OpenAI later as a JSON user-message, not prompt-interpolated.

### Files this sub-plan touches
- **New Convex:**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/onboarding.ts` — queries + mutations
  - `/Users/sebastiansole/Documents/gainsoclock/convex/onboardingInternal.ts` — internal helpers (e.g. `writeAhaDelta` stub, `scheduleProfileErasure` stub used by plan-07 + plan-08)
- **Modified Convex:**
  - `/Users/sebastiansole/Documents/gainsoclock/convex/schema.ts` — add four tables + extend `userSubscriptions`
  - `/Users/sebastiansole/Documents/gainsoclock/convex/validators.ts` — add `goalValidator`, `experienceValidator`, `consentPurposeValidator`, `subscriptionStatusValidator`, `subscriptionSourceValidator`, `dataSourceValidator`, `biologicalSexValidator`, plus exported `ENTITLEMENT_IDS` tuple
  - `/Users/sebastiansole/Documents/gainsoclock/convex/user.ts` — delete `completeOnboarding` (lines 74–101); add `getOnboardingStatus` query backing plan-00's hook with the now-real profile/consents shape
- **New client:**
  - `/Users/sebastiansole/Documents/gainsoclock/lib/consent.ts` — copy constants + `hashConsentCopy`
  - `/Users/sebastiansole/Documents/gainsoclock/lib/id.ts` — nanoid helper
  - `/Users/sebastiansole/Documents/gainsoclock/stores/intake-draft-store.ts` — split slice
- **Dependencies:** `pnpm add expo-crypto nanoid` (if not already present).

### Data contracts

Put these validators in `convex/validators.ts`:

```ts
export const goalValidator = v.union(
  v.literal("stronger"),
  v.literal("leaner"),
  v.literal("healthier"),
  v.literal("routine"),
);
export const experienceValidator = v.union(
  v.literal("beginner"),
  v.literal("returning"),
  v.literal("experienced"),
);
export const consentPurposeValidator = v.union(
  v.literal("health_data_personalization"),
  v.literal("ai_coach_inference"),
  v.literal("analytics"),
);
// NOTE: "marketing" purpose is explicitly NOT in V1 (HealthKit-Privacy C1).
export const subscriptionStatusValidator = v.union(
  v.literal("free"),
  v.literal("trial"),
  v.literal("pro"),
  v.literal("grace"),
  v.literal("paused"),
  v.literal("lapsed"),
);
export const subscriptionSourceValidator = v.union(
  v.literal("rc_intro"),
  v.literal("rc_paid"),
  v.literal("rc_temp"),
  v.literal("app_local"),
);
export const dataSourceValidator = v.union(
  v.literal("healthkit"),
  v.literal("manual"),
  v.literal("mixed"),
);
export const biologicalSexValidator = v.union(
  v.literal("male"),
  v.literal("female"),
);
export const ENTITLEMENT_IDS = ["fitbull_pro"] as const;
```

`lib/subscription-constants.ts` (from plan-00) stays the single source of truth for the literal string; this tuple exists for Convex validator compile-time coverage.

Schema additions in `convex/schema.ts` (append to existing `defineSchema({...})`):

```ts
userProfile: defineTable({
  userId: v.id("users"),
  clientIntakeId: v.optional(v.string()),
  goals: v.array(goalValidator),
  primaryGoal: goalValidator,
  experience: experienceValidator,
  trainingDaysOfWeek: v.array(v.number()), // 0-6 (Sun-Sat), max length 7
  ageYears: v.optional(v.number()),          // 16-100
  biologicalSex: v.optional(biologicalSexValidator),
  weightKg: v.optional(v.number()),           // 30-250
  heightCm: v.optional(v.number()),           // 120-230
  bodyFatPercent: v.optional(v.number()),     // 3-60
  dataSource: dataSourceValidator,
  ahaGenerationCount: v.optional(v.number()),
  lastAhaAt: v.optional(v.string()),
  archetypeKey: v.optional(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
}).index("by_user", ["userId"]),

userConsents: defineTable({
  userId: v.id("users"),
  purpose: consentPurposeValidator,
  granted: v.boolean(),
  version: v.string(),          // 8-hex SHA-256 from lib/consent.ts
  grantedAt: v.string(),        // server-authored ISO
  revokedAt: v.optional(v.string()),
  clientIntakeId: v.optional(v.string()), // replay-safety per row
})
  .index("by_user", ["userId"])
  .index("by_user_purpose", ["userId", "purpose"])
  .index("by_user_purpose_grantedAt", ["userId", "purpose", "grantedAt"]),

onboardingAha: defineTable({
  userId: v.id("users"),
  generationId: v.string(),
  status: v.union(v.literal("streaming"), v.literal("complete"), v.literal("failed")),
  workout: v.optional(v.any()),
  intro: v.optional(v.string()),
  error: v.optional(v.string()),
  profileSnapshot: v.string(),
  startedAt: v.string(),
  completedAt: v.optional(v.string()),
  updatedAt: v.string(),
})
  .index("by_user", ["userId"])
  .index("by_user_generationId", ["userId", "generationId"]),

aiSafetyIncidents: defineTable({
  userId: v.id("users"),
  kind: v.string(),      // e.g. "moderation_flag", "refusal", "bounds_violation"
  detail: v.string(),
  createdAt: v.string(),
}).index("by_user_createdAt", ["userId", "createdAt"]),
```

Extend existing `userSubscriptions` (do NOT re-declare from scratch; patch the `defineTable({...})`):

```ts
userSubscriptions: defineTable({
  userId: v.id("users"),
  revenuecatAppUserId: v.string(),
  entitlement: v.string(),
  isActive: v.boolean(),
  productId: v.optional(v.string()),
  store: v.optional(v.string()),
  expiresAt: v.optional(v.string()),
  updatedAt: v.string(),
  lastEventId: v.optional(v.string()),
  lastEventTimestampMs: v.optional(v.number()),

  // V2 state-machine additions:
  status: v.optional(subscriptionStatusValidator),
  source: v.optional(subscriptionSourceValidator),
  sourceHistory: v.optional(v.array(v.object({
    source: v.string(),
    grantedAt: v.string(),
    reason: v.string(),
  }))),
  cancelReason: v.optional(v.string()),
  trialExpiresAt: v.optional(v.string()),
  willAutoRenew: v.optional(v.boolean()),
  lastVerifiedAt: v.optional(v.string()),
  notificationAnchorAt: v.optional(v.string()),
  dcsaNotifiedAt: v.optional(v.string()),
  reminder48hSentAt: v.optional(v.string()),
  emailOptOut: v.optional(v.boolean()),
  storefrontCountry: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_revenuecat_id", ["revenuecatAppUserId"])
  .index("by_status", ["status"])
  .index("by_status_trialExpiresAt", ["status", "trialExpiresAt"])
  .index("by_status_lastVerifiedAt", ["status", "lastVerifiedAt"])
  .index("by_status_notificationAnchorAt", ["status", "notificationAnchorAt"])
```

`completeOnboardingV2` arg validator:

```ts
args: v.object({
  clientIntakeId: v.string(),
  goals: v.array(goalValidator),
  primaryGoal: goalValidator,
  experience: experienceValidator,
  trainingDaysOfWeek: v.array(v.number()),
  ageYears: v.optional(v.number()),
  biologicalSex: v.optional(biologicalSexValidator),
  weightKg: v.optional(v.number()),
  heightCm: v.optional(v.number()),
  bodyFatPercent: v.optional(v.number()),
  dataSource: dataSourceValidator,
  consents: v.object({
    health_data_personalization: v.boolean(),
    ai_coach_inference: v.boolean(),
    analytics: v.boolean(),
  }),
  consentVersionHash: v.string(),
})
```

Mutation body behaviour (pseudocode):
1. `userId = await getAuthUserId(ctx); if (!userId) throw`.
2. Sanity-bound reject (typed errors): age 16–100, weight 30–250, height 120–230, bodyfat 3–60, `goals.length in [1,4]`, `primaryGoal ∈ goals`, `trainingDaysOfWeek` len 1–7 + each in 0–6.
3. Query existing `userProfile.by_user(userId)`. If `existing.clientIntakeId === args.clientIntakeId` → no-op return existing row (replay dedupe).
4. Otherwise: `ctx.db.patch` or `ctx.db.insert` with server `createdAt`/`updatedAt = new Date().toISOString()`.
5. For each of the three consent purposes: insert a row `{ userId, purpose, granted, version: args.consentVersionHash, grantedAt: server-iso, clientIntakeId: args.clientIntakeId }`.
6. `userOnboarding.hasCompletedOnboarding = true` patch.
7. Return `{ profileId, consentsWritten: 3 }`.

`lib/consent.ts`:
```ts
export const CONSENT_COPY: Record<ConsentPurpose, string> = {
  health_data_personalization:
    "OK, use my weight, height, and workouts on this device to personalise my coach.",
  ai_coach_inference:
    "OK, send my profile (weight, height, age, training goals) to OpenAI (United States, under Standard Contractual Clauses) so the AI coach can generate my plan.",
  analytics:
    "OK, send anonymous usage analytics to PostHog (Frankfurt, EU) so Fitbull can improve the app.",
};
export async function hashConsentCopy(purpose: ConsentPurpose): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    CONSENT_COPY[purpose],
  );
  return digest.slice(0, 8);
}
export async function computeCombinedHash(): Promise<string> {
  const joined = Object.values(CONSENT_COPY).join("\n");
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    joined,
  );
  return digest.slice(0, 8);
}
```
Use `expo-crypto` — not `crypto-js` (keeps bundle lean).

`lib/id.ts`:
```ts
import { nanoid } from "nanoid/non-secure";
export function newClientId(): string { return nanoid(21); }
export function newGenerationId(): string { return nanoid(21); }
```

`stores/intake-draft-store.ts` (Zustand with partitioned persist):
```ts
type NonSpecialDraft = {
  goals?: Goal[];
  primaryGoal?: Goal;
  experience?: Experience;
  trainingDaysOfWeek?: number[];
};
type SpecialDraft = {
  // Art. 9 — in-memory ONLY, never persisted:
  ageYears?: number;
  biologicalSex?: BiologicalSex;
  weightKg?: number;
  heightCm?: number;
  bodyFatPercent?: number;
};
type DraftState = NonSpecialDraft & SpecialDraft & {
  clientIntakeId: string;
  userIdPartition?: string;
  lastTouchedAt?: string;
};
```
Persist config:
- `name: "intake-draft-v2"`.
- `storage: createJSONStorage(() => AsyncStorage)`.
- `partialize`: include only `NonSpecialDraft` + `clientIntakeId` + `userIdPartition` + `lastTouchedAt`. Never persist the Art. 9 fields.
- `onRehydrateStorage`: wipe if `userIdPartition` mismatches the currently authenticated user; wipe if `lastTouchedAt` is older than 7 days.
- Writes use a 300ms debounce + persist-on-blur (Performance #4). Implement via a wrapper helper `setDraftField(key, value)` that schedules a flush through `AppState` background listener + screen-blur.

### Gotchas (from reviews, pulled inline)

- **Offline-Sync #1:** the client call is `useMutation(api.onboarding.completeOnboardingV2)` with explicit retry UI. Do NOT hook this through `lib/convex-sync.ts`. Retry copy comes from `lib/copy/errors.ts` (plan-05 ships the copy file).
- **Convex-Realtime C8:** server-authored `createdAt`, `updatedAt`, `grantedAt`. Client never sends these. If you accept them as args, dedupe breaks the moment a device clock drifts.
- **Security CR4:** `userConsents` rows are never patched or deleted in-place — even `withdrawConsent` inserts a new row. The schema has no field to "revoke in place." If a reviewer asks for `ctx.db.patch(consentId, { granted: false })` say no.
- **Offline-Sync #9:** multi-device — `userProfile` is last-write-wins (upsert by userId); `userConsents` is additive (new rows are cheap). Don't try to reconcile.
- **Theme D / Security CR2:** the Art. 9 slice MUST NOT go into `partialize`. If a future reviewer adds a "persist everything for resume" feature, stop.
- **Convex-Realtime C9:** plan-02 owns the one-shot `migrateSubscriptionsV2` internal mutation that backfills state-machine fields for the 2 TestFlight rows — but this phase must leave those fields `optional` so the migration can land without crashing the existing rows.

## Implementation

1. **Add validators in `convex/validators.ts`.**
   - **What:** append all exports listed under Data contracts.
   - **Approach:** pure validator file, no imports of app code.
   - **Test:** `pnpm convex:dev`.

2. **Extend `convex/schema.ts`.**
   - **What:** add `userProfile`, `userConsents`, `onboardingAha`, `aiSafetyIncidents` tables; extend `userSubscriptions` with V2 columns + four new indexes. Import validators from `./validators`.
   - **Approach:** a single schema PR — Convex handles migrations for added optional fields. Do not drop existing `userSubscriptions` fields.
   - **Test:** `pnpm convex:dev` deploys; dashboard shows new tables + indexes.

3. **Install deps.**
   - `pnpm add expo-crypto nanoid`
   - Both should already exist as transitive deps; confirm pinned versions.
   - **Test:** `pnpm lint` + `npx tsc --noEmit`.

4. **Create `lib/id.ts`.**
   - **What:** `newClientId`, `newGenerationId` per contract. Use `nanoid/non-secure` (cheaper; collision probability acceptable for 21-char IDs at Fitbull scale).
   - **Test:** `npx tsc --noEmit`.

5. **Create `lib/consent.ts`.**
   - **What:** `CONSENT_COPY` + `hashConsentCopy` + `computeCombinedHash` per contract. Wrap in `async` since `expo-crypto` digest is async.
   - **Test:** `npx tsc --noEmit`.

6. **Create `convex/onboardingInternal.ts`.**
   - **What:** stubs that plan-07 + plan-08 fill in:
     - `export const scheduleProfileErasure = internalMutation({ args: { userId: v.id("users") }, handler: async (ctx, { userId }) => { /* TODO(plan-08): cascade delete */ } });`
     - `export const writeAhaDelta = internalMutation({ args: { generationId: v.string(), userId: v.id("users"), workout: v.any(), intro: v.optional(v.string()) }, handler: async (ctx, args) => { /* TODO(plan-07): upsert by (userId, generationId) */ } });`
   - **Approach:** ship stubs with typed signatures so plan-07/08 can fill bodies without schema churn. Each stub's body throws `new Error("not implemented")` under `__DEV__`-equivalent (`process.env.NODE_ENV !== "production"`); in production the handler is a no-op patch. Mark with `TODO(plan-07)` / `TODO(plan-08)` comments.
   - **Test:** `pnpm convex:dev`.

7. **Create `convex/onboarding.ts`.**
   - **What:**
     - `completeOnboardingV2` (public `mutation`): arg validator per contract; body per contract.
     - `getProfile` (public `query`): returns `ctx.db.query("userProfile").withIndex("by_user", q => q.eq("userId", userId)).unique()`.
     - `getConsents` (public `query`): reduces `userConsents.by_user_purpose_grantedAt` to latest per purpose. Returns `{ health_data_personalization: { granted, grantedAt, version } | null, ai_coach_inference: ..., analytics: ... }`.
     - `withdrawConsent` (public `mutation`): args `{ purpose: consentPurposeValidator }`. Body: look up latest row for purpose; insert a new row `{ granted: false, grantedAt: serverNow, version: latest.version, revokedAt: serverNow }`. If the revoked purpose is `ai_coach_inference`, patch all `onboardingAha` rows for that user to `status: "failed"` with `error: "consent_revoked"` (plan-08 may extend this cascade). If `health_data_personalization`, schedule `internal.onboardingInternal.scheduleProfileErasure({ userId })`. If `analytics`, no server cascade beyond the row (client + plan-08 Settings handle PostHog delete).
     - `deleteAccount` (public `mutation`): cascade delete per §3.10 of master plan. Full cascade implementation lives in plan-08; here stub as a mutation that throws `"not_implemented"` with a `TODO(plan-08)` comment — but expose the signature so plan-00's `getOnboardingStatus` query and plan-08's settings screen have a stable import path.
   - **Approach:** every handler opens with `getAuthUserId`. `userId` is never an arg. Use `Date` server-side only (`new Date().toISOString()`).
   - **Test:** `pnpm convex:dev`. Manually call via Convex dashboard REPL: sign in a dev user, call `completeOnboardingV2` with valid args → verify 1 profile row, 3 consent rows. Call again with same `clientIntakeId` → verify no new rows. Call with `ageYears: 15` → verify typed error.

8. **Update `convex/user.ts`.**
   - **What:**
     - Delete `completeOnboarding` (lines 74–101). Search for every call site — there should be none after plan-00, but verify.
     - Add `getOnboardingStatus` public query: returns `{ hasCompletedOnboarding: boolean, profile: UserProfile | null, consents: ConsentMap | null }` where `hasCompletedOnboarding` comes from `userOnboarding` and the other fields from the new `onboarding.getProfile` / `onboarding.getConsents` logic. This backs plan-00's hook with the real shape.
   - **Test:** `pnpm convex:dev`. Plan-00's `useOnboardingStatus` hook now returns real profile + consents for users who have completed v2.

9. **Create `stores/intake-draft-store.ts`.**
   - **What:** Zustand store with the split slice per contract.
   - **Approach:**
     - Use `zustand/middleware/persist` with `partialize`.
     - Store exposes `setDraftField<K extends keyof DraftState>(key: K, value: DraftState[K]): void`. Internally schedules a debounced flush (300ms) + registers an `AppState` listener that flushes on `background`.
     - Expose `clearDraft(): void` (called on sign-out, on-success, user-initiated reset).
     - Expose `ensureUserPartition(userId: string): void` — called from the auth provider on login; wipes the persisted slice if `userIdPartition` mismatches.
     - The in-memory Art. 9 slice lives on a plain internal `useRef`-like module-scoped object, or a sibling Zustand slice without `persist`. Do NOT put Art. 9 fields inside `partialize`.
   - **Test:** `npx tsc --noEmit`; write a dev harness that sets `ageYears`, kills the app, relaunches → `ageYears` is gone but `goals` are present. Verify 7-day staleness purge by backdating `lastTouchedAt` in AsyncStorage and relaunching.

10. **Wire `hooks/use-onboarding-status.ts` to the real query.**
    - **What:** plan-00 stubbed `profile`/`consents` as `null`. Now update the hook to map `api.user.getOnboardingStatus`'s real return shape into the tri-state.
    - **Test:** `npx tsc --noEmit`; manual smoke with a dev user.

### Test discipline
- After step 2: `pnpm convex:dev` + dashboard inspection for new tables/indexes.
- After step 7: REPL exercise of `completeOnboardingV2` happy path + idempotency + sanity-bound rejection + age-gate rejection.
- After step 9: dev-harness persistence test.
- Final: `pnpm lint` + `npx tsc --noEmit` + `pnpm convex:dev`.

## Acceptance Criteria

- [ ] Code: `convex/schema.ts` declares `userProfile`, `userConsents`, `onboardingAha`, `aiSafetyIncidents` with the indexes listed in Data contracts.
- [ ] Code: `userSubscriptions` in `convex/schema.ts` has `status`, `source`, `sourceHistory`, `cancelReason`, `trialExpiresAt`, `willAutoRenew`, `lastVerifiedAt`, `notificationAnchorAt`, `dcsaNotifiedAt`, `reminder48hSentAt`, `emailOptOut`, `storefrontCountry` optional columns and `by_status`, `by_status_trialExpiresAt`, `by_status_lastVerifiedAt`, `by_status_notificationAnchorAt` indexes.
- [ ] Code: `convex/validators.ts` exports `goalValidator`, `experienceValidator`, `consentPurposeValidator`, `subscriptionStatusValidator`, `subscriptionSourceValidator`, `dataSourceValidator`, `biologicalSexValidator`, `ENTITLEMENT_IDS`.
- [ ] Code: `convex/onboarding.ts` exports `completeOnboardingV2`, `getProfile`, `getConsents`, `withdrawConsent`, `deleteAccount` (stub).
- [ ] Code: `convex/onboardingInternal.ts` exports `writeAhaDelta` + `scheduleProfileErasure` stubs with typed signatures and `TODO(plan-XX)` markers.
- [ ] Code: `lib/consent.ts` + `lib/id.ts` exist with the declared exports.
- [ ] Code: `stores/intake-draft-store.ts` persists only non-special fields (verify via `partialize` or manual AsyncStorage inspection).
- [ ] Code: `convex/user.ts:74-101` `completeOnboarding` is deleted; `getOnboardingStatus` query exists.
- [ ] Types: `npx tsc --noEmit` passes.
- [ ] Convex: `pnpm convex:dev` deploys cleanly.
- [ ] Lint: `pnpm lint` passes.
- [ ] Manual smoke (Convex REPL / dashboard):
  - `completeOnboardingV2` happy path writes 1 `userProfile` row + 3 `userConsents` rows + patches `userOnboarding.hasCompletedOnboarding`.
  - Replay with same `clientIntakeId` is a no-op (no new rows, no error).
  - `ageYears: 15` is rejected with a typed error mentioning age gate.
  - `weightKg: 500` is rejected.
  - `goals.length === 0` is rejected.
  - `withdrawConsent({ purpose: "ai_coach_inference" })` appends a `granted: false` row AND marks any existing `onboardingAha` rows for the user as `status: "failed"` with `error: "consent_revoked"`.
  - `getConsents` returns latest-per-purpose.
- [ ] Manual smoke (client): the intake-draft store partitions by userId; switching users wipes the partition; Art. 9 fields never appear in AsyncStorage inspection.
- [ ] Out-of-scope (explicitly not this phase): the webhook rewrite (plan-02), the aha action body (plan-07), the Settings deletion cascade body (plan-08), any UI screens (plan-05+).

## Risks

- **Risk:** adding the state-machine columns to `userSubscriptions` as non-optional breaks the 2 existing TestFlight rows.
  - **Detect:** `pnpm convex:dev` deploy will fail with validator errors.
  - **Mitigate:** every new column is `v.optional(...)`. The actual backfill is plan-02's `migrateSubscriptionsV2`. Do not make them required here.
  - **Escalate:** if a reviewer asks to tighten the validators, push back — backfill first (plan-02), tighten later (V1.1).

- **Risk:** `v.any()` on `onboardingAha.workout` propagates as `any` into client code.
  - **Detect:** `npx tsc --noEmit` in plan-07 will surface `any`.
  - **Mitigate:** consumer parses the returned value through a Zod-equivalent or a runtime `typeof`-narrow into `AhaWorkout`. Plan-07 owns this.
  - **Escalate:** if another reviewer asks for a full Convex validator for the workout shape, explain: streaming writes full JSON each tick; validator would reject the first tick where `exercises` is still a partial array. Rendering is on-complete only, so the `any` is intentional.

- **Risk:** the intake-draft store accidentally persists Art. 9 via a naive `create(..., (set) => ...)` without `partialize`.
  - **Detect:** inspect AsyncStorage in a dev build after entering weight/height.
  - **Mitigate:** `partialize` uses an allowlist, not a denylist. Test explicitly. If the allowlist approach isn't supported by the Zustand version in use, implement a custom `serialize` that strips Art. 9 fields before write.
  - **Escalate:** if Zustand version constraints make safe partitioning impossible, consider a plain custom AsyncStorage wrapper for the non-special slice only.

- **Risk:** `withdrawConsent` cascade onto `onboardingAha` rows races with an in-flight `generateAhaWorkout` action.
  - **Detect:** plan-07's action writes to an `onboardingAha` row whose owner has just revoked consent.
  - **Mitigate:** plan-07's action opens with a consent check; if the cascade runs between consent-check and `writeAhaDelta`, the next `writeAhaDelta` call from the streaming loop will overwrite `status: "failed"` back to `"streaming"`. Plan-07 must re-check consent on every delta OR accept that the final `status: "complete"` may land despite revocation; the stored row is then manually archived by the cascade on the next `withdrawConsent` invocation. Document this trade-off in the plan-07 risks section.
  - **Escalate:** if the user-facing risk (aha card briefly visible after revoke) is unacceptable, coordinate with plan-07 to add a `userConsents.by_user_purpose` check at `writeAhaDelta` entry.

- **Risk:** `getAuthUserId` not called in one of the handlers leaks cross-user data.
  - **Detect:** code review + plan-10 security pass.
  - **Mitigate:** every public handler opens with the call. Enforce by code review. Consider a grep gate in plan-10.
  - **Escalate:** immediate.

## Verification Checklist for /prism-run

1. `pnpm lint` — green.
2. `npx tsc --noEmit` — green.
3. `pnpm convex:dev` — green; Convex dashboard shows the four new tables and the new indexes on `userSubscriptions`.
4. Maestro: not applicable (no UI in this phase).
5. Manual smoke (Convex dashboard REPL or a tiny dev button wired temporarily):
   - Call `completeOnboardingV2` as a signed-in dev user; verify rows.
   - Call it again with the same `clientIntakeId`; verify no duplicate rows.
   - Call with under-16 age; verify typed error.
   - Call `withdrawConsent`; verify append + aha cascade.
6. Report diffs: list every created file, every modified file, and the resulting schema diff. Confirm the `getOnboardingStatus` query returns the real profile/consents shape used by plan-00's hook.
