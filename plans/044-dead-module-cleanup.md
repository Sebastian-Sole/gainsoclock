# Plan 044: Delete the sixteen dead modules and fix the docs that point at them

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- components/ui components/chat/chat-list.tsx components/explore/meals-section.tsx components/paywall hooks/use-theme-color.ts lib/copy`
> If anything changed since this plan was written, re-run the Step 1 greps
> before deleting anything.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (nothing imports these; tsc/lint/grep re-verify)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

Sixteen files have zero importers anywhere in `app/`, `components/`,
`hooks/`, `stores/`, `providers/`, `lib/`, `convex/` (verified by
import-graph grep at `08f585b`, spot-checked file-by-file). Dead UI
primitives are the worst kind of dead code: they look load-bearing and
invite someone to build on a stale copy. Two of them are actively
contradicted by documentation: `.claude/rules/coding-conventions.md`
instructs using `Label` from `components/ui/label.tsx` (nothing imports
it), and `CLAUDE.md` cites `components/ui/icon-symbol.ios.tsx` as the
platform-variant exemplar. There is no bundle-size angle (Metro tree-shakes
— measured in `docs/perf/baseline.md`); this is maintenance-surface
reduction only.

## Current state

The dead list (each verified zero-importer at `08f585b`):

```
components/ui/card.tsx
components/ui/label.tsx
components/ui/checkbox.tsx
components/ui/select.tsx
components/ui/dialog.tsx
components/ui/alert-dialog.tsx
components/ui/toggle.tsx
components/ui/dropdown-menu.tsx
components/ui/icon-symbol.tsx
components/ui/icon-symbol.ios.tsx
components/chat/chat-list.tsx
components/explore/meals-section.tsx
components/paywall/paywall-interstitial.tsx
components/paywall/paywall-fallback.tsx
hooks/use-theme-color.ts
lib/copy/errors.ts
```

(The two paywall files were already recorded as dead in `plans/README.md`
NEW-03, last cycle; the rest are new confirmations.)

Doc references that must be reconciled:

- `.claude/rules/coding-conventions.md`, Accessibility section: "Form
  inputs: associate a visible label (`Label` from `components/ui/label.tsx`)
  with the input." — references a component no form imports.
- `CLAUDE.md`, Critical Constraints + Gotchas: cites
  `components/ui/icon-symbol.ios.tsx` (alongside
  `hooks/use-color-scheme.web.ts`) as the `.ios.tsx` platform-variant
  example. `hooks/use-color-scheme.web.ts` is alive — it becomes the sole
  example.

Repo context: `components/ui/` primitives wrap `@rn-primitives/*`
(shadcn-style). The *live* primitives (button, input, switch, progress,
separator, tabs, etc.) stay. `components.json` (shadcn config) does not
enumerate components — no change there.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Tests | `pnpm test` | exit 0 |

## Scope

**In scope**:
- Deleting exactly the sixteen files listed above.
- `.claude/rules/coding-conventions.md` — one sentence rewrite.
- `CLAUDE.md` — the two example mentions.
- `.claude/skills/mobile-ux-ios/SKILL.md` — one sentence rewrite (line 74
  also cited `components/ui/label.tsx`). *(Amended 2026-07-02 during
  execution review; the original scope missed this third doc reference —
  the executor's Step-3 verify grep caught it and correctly reported
  rather than improvising.)*

**Out of scope** (do NOT touch):
- Every OTHER file in `components/ui/` — live primitives.
- `@rn-primitives/*` entries in `package.json` — even if a deleted wrapper
  was their only consumer, dependency pruning is a separate decision
  (report which became orphaned instead; see Step 4).
- Anything in `.maestro/` — flows reference rendered testIDs, and dead
  components render nowhere, but re-check in Step 1 anyway.

## Git workflow

- Branch: `advisor/044-dead-module-cleanup`
- Commit style: `chore: delete 16 zero-importer modules; fix stale doc references`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Re-verify each file is still dead

For each of the sixteen files, run (adjusting the specifier — the import
path is the file path without extension, e.g. `components/ui/card`,
`@/components/ui/card`, or a relative form):

```bash
grep -rn "ui/card" app components hooks stores providers lib convex --include='*.ts' --include='*.tsx' | grep -v "components/ui/card"
```

Also check `.maestro/` for any testID that only a dead component renders:
`grep -rn "<some testID from the file>" .maestro/` for the two paywall files
(they are testID-rich). Every grep must come back empty (excluding the
file itself and its dead siblings importing each other).

**Verify**: zero external references per file. Any hit → that file drops
out of the deletion list; note it in the report.

### Step 2: Delete and gate

Delete the (still-dead) files. If `lib/copy/` becomes an empty directory,
remove the directory.

**Verify**: `npx tsc --noEmit` → 0; `pnpm lint` → 0; `pnpm test` → 0.

### Step 3: Fix the doc references

- `.claude/rules/coding-conventions.md`: change the Label sentence to
  "Form inputs: give the input a visible text label (a styled `<Text>`
  associated via `accessibilityLabel`/`nativeID`); placeholder text is not
  a label." (Keep the rest of the bullet intact.)
- `CLAUDE.md`: in the two spots that cite `components/ui/icon-symbol.ios.tsx`
  as the variant example, keep the guidance and cite only
  `hooks/use-color-scheme.web.ts`.

**Verify**: `grep -rn "icon-symbol" CLAUDE.md .claude/` → 0;
`grep -rn "components/ui/label" .claude/` → 0.

### Step 4: Orphaned-dependency report (report only, no changes)

Check whether any `@rn-primitives/*` package lost its last importer:

```bash
for p in checkbox select dialog alert-dialog toggle dropdown-menu label; do
  echo "== $p =="; grep -rn "@rn-primitives/$p" app components hooks lib --include='*.ts*' | head -3;
done
```

List the now-orphaned packages in your report for the operator to prune
later. Do NOT edit `package.json`.

## Test plan

No new tests — deletion only. The gate is the full verification chain plus
the reference greps.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] All sixteen files gone (`ls` each → no such file), or the report names
      which were kept and the hit that saved them
- [ ] `npx tsc --noEmit`, `pnpm lint`, `pnpm test` all exit 0
- [ ] `grep -rn "icon-symbol" CLAUDE.md` → 0
- [ ] `git status` shows only deletions + the two doc files
- [ ] `plans/README.md` status row updated (include the orphaned-deps list from Step 4)

## STOP conditions

Stop and report back (do not improvise) if:

- Any Step 1 grep finds a live importer — do not delete that file; report.
- `tsc`/lint fail after deletion in a file you didn't touch — an implicit
  dependency the greps missed; restore and report.
- You are tempted to also delete "nearly dead" files not on the list — don't;
  the list is closed.

## Maintenance notes

- If the operator intended `components/ui/` as a kept-but-unused shadcn
  library, the alternative was documenting that intent instead — deleting
  was chosen because git history preserves everything and undocumented
  "libraries" rot. Reviewer can veto per-file at review time.
- Reviewer: eyeball that no deleted primitive had a platform sibling left
  behind (icon-symbol had `.tsx` + `.ios.tsx`; both are on the list).
- Follow-up owned by operator: prune orphaned `@rn-primitives/*` deps from
  `package.json` (Step 4's list) in a normal deps PR.
