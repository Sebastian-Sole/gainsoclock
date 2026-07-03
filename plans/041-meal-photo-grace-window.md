# Plan 041: Close the discardMealPhoto ownership grace window

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- convex/nutritionVision.ts`
> If the file changed since this plan was written, compare the
> "Current state" excerpt against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (but see the release-gate STOP condition)
- **Category**: security
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

`discardMealPhoto` deletes a Convex storage object. Ownership is tracked in
the `mealPhotos` table, but the handler currently contains a deliberate,
TODO-marked grace window: when NO ownership row exists for the supplied
`storageId`, the delete is allowed anyway (photos uploaded by clients that
predate ownership tracking have no row). That window means any authenticated
user who supplies a foreign `storageId` with no row can delete that object.
Blast radius is small (storage IDs are opaque; meal photos are transient and
swept after 24h), but the code itself documents the intended end state:
once all clients register photos on upload, a missing row only ever means a
foreign ID and the branch must deny. This plan flips it — the analyze path
(`analyzeMealPhoto`) already fails closed the same way.

## Current state

- `convex/nutritionVision.ts:185-201`:

  ```ts
  export const discardMealPhoto = mutation({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
      const userId = await getAuthUserId(ctx);
      if (!userId) throw new Error("Not authenticated");

      const row = await findPhotoOwnerRow(ctx, args.storageId);
      // TODO(remove after 1 release): grace window for photos uploaded before
      // ownership tracking shipped — those have no row, so allow the discard.
      // Once all clients register on upload (Step 4), a missing row only ever
      // means a foreign id and this branch can deny instead.
      if (row && row.userId !== userId) throw new Error("not_photo_owner");

      await ctx.storage.delete(args.storageId);
      if (row) await ctx.db.delete(row._id);
    },
  });
  ```

- The registration step clients now perform on upload:
  `registerMealPhoto` (same file, ~lines 160-178 — inserts the
  `mealPhotos` row with `userId` + `storageId`).
- The fail-closed exemplar: `analyzeMealPhoto`'s ownership check throws
  `not_photo_owner` when the owner row is missing or foreign (same file,
  around lines 359-365, via the `getPhotoOwner` internal query at
  lines 209-214).
- Cleanup safety net: `sweepOrphanPhotos` (same file — find it before
  editing) deletes unregistered/stale photos after ~24h, so legacy no-row
  photos still get removed even when clients can no longer discard them.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only file you should modify):
- `convex/nutritionVision.ts` — the `discardMealPhoto` handler only.

**Out of scope** (do NOT touch, even though they look related):
- `registerMealPhoto`, `analyzeMealPhoto`, `sweepOrphanPhotos`, the
  internal queries — all correct as-is.
- Client photo flow (`components/nutrition/photo-meal-sheet.tsx`) — no
  client change needed; it registers on upload already.

## Git workflow

- Branch: `advisor/041-photo-grace-window`
- Commit style: `fix(nutrition): deny discardMealPhoto without an ownership row`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the release gate (STOP if it fails)

The TODO says "remove after 1 release": the deny is only safe once every
client in the field registers photos on upload. Check with the operator (or
the release notes / App Store history if accessible) that at least one App
Store release containing `registerMealPhoto` has shipped and had normal
uptake time. **If you cannot confirm this, STOP and mark the plan BLOCKED
with reason "release gate unconfirmed" — do not guess.** (Context: the
registration code merged to `main` in the advisor-wave integration, PR #75,
2026-06; whether a store build shipped since is operator knowledge.)

### Step 2: Flip the branch to fail closed

Replace the guard and its TODO comment:

```ts
const row = await findPhotoOwnerRow(ctx, args.storageId);
// Fail closed: every client registers photos on upload (registerMealPhoto),
// so a missing row means a foreign or unregistered id — never delete it.
// (Grace window for pre-tracking uploads removed; sweepOrphanPhotos still
// cleans any legacy strays.)
if (!row || row.userId !== userId) throw new Error("not_photo_owner");

await ctx.storage.delete(args.storageId);
await ctx.db.delete(row._id);
```

Note the last line loses its `if (row)` guard — `row` is now always present.

**Verify**: `npx tsc --noEmit -p convex` → exit 0; `pnpm lint` → exit 0.

## Test plan

No convex unit runner (settled decision). Reviewer-verifiable by
inspection: the handler now has the same fail-closed shape as
`analyzeMealPhoto`'s ownership check. Runtime spot-check (operator, after
deploy): photo-log a meal and cancel — the discard succeeds; the happy path
still works because the client registered the photo first.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "TODO(remove after 1 release)" convex/nutritionVision.ts` → 0
- [ ] `grep -c "if (!row || row.userId !== userId)" convex/nutritionVision.ts` → 1
- [ ] `npx tsc --noEmit -p convex` exits 0; `pnpm lint` exits 0
- [ ] `git status` shows only `convex/nutritionVision.ts` modified
- [ ] `plans/README.md` status row updated (note: needs Convex deploy, operator)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's release gate cannot be confirmed (BLOCKED, not skipped).
- The handler no longer matches the excerpt (someone already closed the
  window, or the ownership model changed).
- You find any OTHER call path that deletes storage without an ownership
  check while reading the file — report it as a new finding; do not widen
  this plan's scope.

## Maintenance notes

- If support tickets appear about "can't remove photo" from very old app
  builds, that's this deny working as intended; the 24h sweep removes the
  object anyway.
- Reviewer: confirm the thrown error string stays `not_photo_owner` (the
  client matches on it) and that the `ctx.db.delete(row._id)` no longer has
  a conditional.
