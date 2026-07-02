# Plan 039: Index-scope the subscription crons instead of collecting whole status partitions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- convex/subscriptionCrons.ts convex/schema.ts`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW (same rows selected, index-scoped; JS guards stay as belt-and-braces)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

Three cron handlers in `convex/subscriptionCrons.ts` read an entire status
partition of `userSubscriptions` into memory and filter in JS — daily for
trial reminders and DCSA emails, **hourly** for temp-grant demotion — even
though `convex/schema.ts` already defines compound indexes whose range
component they ignore. Document-read cost scales linearly with the paid-user
base and the hourly job touches every `pro` row 24×/day to act on a handful
of transient `rc_temp` rows. Range-scoping returns only actionable rows.

## Current state

- Indexes that already exist — `convex/schema.ts:161-164` on
  `userSubscriptions`:

  ```ts
  .index("by_status", ["status"])
  .index("by_status_trialExpiresAt", ["status", "trialExpiresAt"])
  .index("by_status_lastVerifiedAt", ["status", "lastVerifiedAt"])
  .index("by_status_notificationAnchorAt", ["status", "notificationAnchorAt"]),
  ```

  `trialExpiresAt` / `notificationAnchorAt` are ISO-8601 strings — they sort
  lexicographically = chronologically, so string range bounds work.

- `sendTrialReminders` (`convex/subscriptionCrons.ts:21-…`), daily. Collects
  all trials then JS-filters into a 46-50h window:

  ```ts
  // :24-31
  const nowMs = Date.now();
  const lowerMs = nowMs + REMINDER_WINDOW_LOWER_MS;
  const upperMs = nowMs + REMINDER_WINDOW_UPPER_MS;
  const trials = await ctx.db
    .query("userSubscriptions")
    .withIndex("by_status", (q) => q.eq("status", "trial"))
    .collect();
  // :34-39 — per-row guards: reminder48hSentAt, !trialExpiresAt,
  // Number.isFinite(trialEndsMs), window check
  ```

- `sendDcsa6Month` (`:80-125`), daily. Collects ALL `status="pro"` rows,
  then JS-filters `notificationAnchorAt + DCSA_INTERVAL_MS <= now` with
  idempotency via `dcsaNotifiedAt` (lines 90-100).

- `demoteExpiredTempGrants` (`:132-…`), **hourly**. Collects ALL
  `status="pro"` rows, then acts only on `row.source === "rc_temp"` with
  elapsed `expiresAt` (lines 143-147). There is currently no index with
  `source` in it.

- Cron registrations live in `convex/crons.ts` (4 entries) — unchanged by
  this plan.
- Convention: indexes are declared in `schema.ts`; "if you query by a field
  that isn't indexed, add the index before merging"
  (`.claude/rules/coding-conventions.md`, Convex section).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| App typecheck (unaffected, run anyway) | `npx tsc --noEmit` | exit 0 |

Note: deploying the schema/index change is `pnpm convex:dev` (dev) — an
operator action. Your job is the code + typecheck; note the deploy need in
your report.

## Scope

**In scope** (the only files you should modify):
- `convex/subscriptionCrons.ts`
- `convex/schema.ts` (one new index only)

**Out of scope** (do NOT touch, even though they look related):
- `convex/subscriptions.ts`, `convex/crons.ts`, `convex/email.ts` — schedule
  and email senders are unchanged.
- The per-row guard logic and patch payloads inside each handler — keep them
  byte-identical; this plan changes only *which rows are fetched*.
- `by_status_lastVerifiedAt` and any consumer of it.

## Git workflow

- Branch: `advisor/039-cron-index-scoping`
- Commit style: `perf(subscriptions): range-scope cron queries via existing indexes`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Range-scope `sendTrialReminders`

Replace the `by_status` collect with the compound index and ISO bounds:

```ts
const lowerIso = new Date(lowerMs).toISOString();
const upperIso = new Date(upperMs).toISOString();
const trials = await ctx.db
  .query("userSubscriptions")
  .withIndex("by_status_trialExpiresAt", (q) =>
    q.eq("status", "trial")
      .gte("trialExpiresAt", lowerIso)
      .lte("trialExpiresAt", upperIso)
  )
  .collect();
```

Keep ALL existing per-row guards (`reminder48hSentAt`, missing/invalid
`trialExpiresAt`, window re-check) — they are now belt-and-braces and keep
behavior identical for edge encodings.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 2: Range-scope `sendDcsa6Month`

Same pattern with `by_status_notificationAnchorAt`: `.eq("status","pro")`,
`.gt("notificationAnchorAt", "")` (excludes rows where the field is unset —
Convex orders `undefined` before all strings, and the current code skips
`!row.notificationAnchorAt`), `.lte("notificationAnchorAt", cutoffIso)`
where `cutoffIso = new Date(nowMs - DCSA_INTERVAL_MS).toISOString()`
(algebra: `anchor + interval <= now` ⇔ `anchor <= now - interval`). Keep all
per-row guards including the `dueAt`/`dcsaNotifiedAt` idempotency check.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 3: Add a `by_status_source` index and scope the hourly demote

In `convex/schema.ts`, add to `userSubscriptions` (next to the existing
`.index(...)` chain at lines 161-164):

```ts
.index("by_status_source", ["status", "source"])
```

Then in `demoteExpiredTempGrants`:

```ts
const proRows = await ctx.db
  .query("userSubscriptions")
  .withIndex("by_status_source", (q) =>
    q.eq("status", "pro").eq("source", "rc_temp")
  )
  .collect();
```

Remove ONLY the now-redundant `if (row.source !== "rc_temp") continue;`
guard; keep the `expiresAt` checks and the patch payload untouched.

**Verify**: `npx tsc --noEmit -p convex` → exit 0; `pnpm lint` → exit 0.

### Step 4: Equivalence re-read

For each handler, diff old vs new and confirm: same guards, same patch
calls, same log lines; the ONLY change is the `withIndex` clause (plus one
removed redundant guard in Step 3).

**Verify**: `git diff -- convex/subscriptionCrons.ts` shows changes confined
to the three `withIndex` blocks + the one removed guard line.

## Test plan

No unit runner covers `convex/` (Vitest scope is `lib/**` by decision —
`docs/decisions/test-runner.md`). The safety argument is the equivalence
re-read (Step 4) + preserved JS guards + convex typecheck. In your report,
include the before/after query snippets per handler so the reviewer can
verify selection-equivalence by inspection.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "by_status\"" convex/subscriptionCrons.ts` → 0 (no bare-status collects remain in this file)
- [ ] `grep -c "by_status_source" convex/schema.ts` → 1
- [ ] `npx tsc --noEmit -p convex` exits 0; `npx tsc --noEmit` exits 0; `pnpm lint` exits 0
- [ ] `git status` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated, noting "needs `pnpm convex:dev` deploy (operator)"

## STOP conditions

Stop and report back (do not improvise) if:

- The timestamp fields turn out not to be ISO strings everywhere (check
  `convex/schema.ts`'s `userSubscriptions` field validators before Step 1;
  if any writer stores a non-ISO format, the lexicographic-range premise
  fails).
- Convex's query builder rejects the `.gt("notificationAnchorAt", "")`
  undefined-exclusion pattern — report; do not silently switch to an
  unbounded upper-only range (it would include unset anchors).
- Any handler contains logic since `08f585b` that the excerpts don't show.

## Maintenance notes

- After merge, the operator must deploy (`pnpm convex:dev` / prod deploy)
  for the new `by_status_source` index to build; the hourly cron keeps
  working on the old code path until then.
- Reviewer: check the DCSA cutoff algebra (`now - interval` vs
  `anchor + interval`) — an inverted bound silently sends nothing (or
  everything).
- If a future cron filters `pro` rows by another discriminator, extend the
  compound-index approach rather than reverting to `by_status` + JS filter.
