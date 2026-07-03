# Plan 040: Log AI-chat failures and cap the exercise library in the system prompt

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f585b..HEAD -- convex/chatActions.ts convex/chatInternal.ts`
> If either file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (observability) + perf (prompt cost)
- **Planned at**: commit `08f585b`, 2026-07-02

## Why this matters

Two hygiene defects in the Pro-gated AI coach path. (1) The outermost catch
in the chat action writes a generic "Sorry, I encountered an error" message
and **discards the error** — OpenAI failures, truncated tool-call JSON, and
mutation errors are all invisible in Convex logs, making the paid feature
undebuggable in production. That catch also covers `JSON.parse` of streamed
tool-call arguments, which throws when `max_completion_tokens: 8000`
truncates a tool call mid-JSON — currently failing the *whole turn* even
though streamed text already exists. (2) The system prompt embeds the user's
**entire exercise library**; every sibling context section is bounded
(templates −10, recent logs 20, history 20) but exercises are not, so
per-message token cost grows without limit for long-lived users. The
`ai_context_size` PostHog event (chatActions.ts:717-731) measures exactly
this (`exerciseCount`) but nothing caps it.

## Current state

- `convex/chatActions.ts:901-909` — the swallow:

  ```ts
  } catch (error) {
    // Mark message as error
    await ctx.runMutation(internal.chat.updateMessageContent, {
      messageId: assistantMessageId,
      content:
        "Sorry, I encountered an error processing your request. Please try again.",
      status: "error",
    });
  }
  ```

- `convex/chatActions.ts:829` (and per-extra-tool at `:850`) — unguarded
  parses inside that try block:

  ```ts
  const firstToolArgs = JSON.parse(firstToolCall.arguments);
  ```

  Context: `toolCalls` are accumulated from stream deltas; the OpenAI call
  is created at `:748-755` with `max_completion_tokens: 8000`, so a long
  response can cut `arguments` mid-string.
- `convex/chatInternal.ts` — `getUserContext`: exercises are fetched
  unbounded at lines 19-22 (`by_user` index, `.collect()`) and returned
  unbounded at line 267 (`exercises: exercises.map((e) => ({ name: e.name, type: e.type }))`),
  while siblings are bounded: templates `.slice(-10)` (line 49), recent logs
  `.slice(0, 20)` (line 84), per-exercise history `exercises.slice(0, 20)`
  (line 156).
- `convex/chatActions.ts:528-531` — the prompt builder lists every entry:

  ```ts
  const exerciseList =
    context.exercises.length > 0
      ? context.exercises.map((e) => `- ${e.name} (${e.type})`).join("\n")
      : "No exercises yet.";
  ```

- Repo conventions: no `console.log` in committed code, but `console.warn`/
  `console.error` for operator-visible server conditions is established
  practice (e.g. `lib/convex-sync.ts:152`, `convex/auth.ts:71`). Never log
  message content or tokens — counts and error strings only (matches the
  `ai_context_size` "counts only, never content" comment at
  `chatActions.ts:717`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck convex | `npx tsc --noEmit -p convex` | exit 0 |
| Lint | `pnpm lint` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `convex/chatActions.ts`
- `convex/chatInternal.ts`

**Out of scope** (do NOT touch, even though they look related):
- `convex/aiTools.ts`, `convex/chat.ts` — tool execution and message CRUD
  are fine.
- The `ai_context_size` analytics block — leave as-is (it's the measurement
  this plan acts on).
- Any change to prompts' wording, model, or `max_completion_tokens`.
- `getUserContext`'s other sections and their bounds.

## Git workflow

- Branch: `advisor/040-chat-hygiene`
- Commit style: `fix(chat): log failures, degrade truncated tool calls, cap exercise list`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Log the swallowed error

In the catch at `chatActions.ts:901`, before the recovery mutation, add:

```ts
const reason = error instanceof Error ? error.message : String(error);
console.error(`[chat] sendMessage failed: ${reason}`);
```

Do not log `messages`, prompt content, or tool arguments.

**Verify**: `npx tsc --noEmit -p convex` → exit 0.

### Step 2: Degrade truncated tool calls instead of failing the turn

Wrap each `JSON.parse(tc.arguments)` (both the `firstToolCall` at `:829`
and the loop at `:850`) so a parse failure:

- `console.error`s `[chat] tool-call arguments unparseable (likely token
  truncation): <toolName>` (name only, never the arguments), and
- skips creating that tool call's `pendingApproval` — for the first tool
  call, fall back to updating the assistant message with the streamed
  `fullContent` and `status: "complete"` (no `pendingApproval` field); for
  extra tool calls in the loop, `continue`.

Keep the happy path byte-identical. The shape to follow already exists in
the same file: the title-generation try/catch commented "Title generation is
non-critical" (immediately above the outer catch) — same graceful-degrade
philosophy.

**Verify**: `npx tsc --noEmit -p convex` → exit 0;
`grep -c "JSON.parse" convex/chatActions.ts` — every remaining occurrence
in the tool-call region is inside a try/catch (inspect each).

### Step 3: Cap the exercise list in context

In `convex/chatInternal.ts:267`, bound the list to the 150 most recent and
carry the true total so the prompt can say so:

```ts
exercises: exercises.slice(-150).map((e) => ({ name: e.name, type: e.type })),
exercisesTotal: exercises.length,
```

(`by_user` index order is insertion order — `slice(-150)` keeps the newest.
If `UserContext`'s type lives in this file or `chatActions.ts`, add
`exercisesTotal: number` to it.) Then in `buildSystemPrompt`
(`chatActions.ts:528-531`), when `context.exercisesTotal >
context.exercises.length`, append one line to `exerciseList`:
`- …and ${context.exercisesTotal - context.exercises.length} more (older)`.

**Verify**: `npx tsc --noEmit -p convex` → exit 0; `pnpm lint` → exit 0.

## Test plan

`convex/` has no unit runner (settled decision — `docs/decisions/test-runner.md`).
Gate = convex typecheck + the greps above + reviewer inspection. If you can
run a dev deployment (`pnpm convex:dev` requires operator credentials — do
NOT set one up yourself), note in the report that runtime verification is
an operator step: send a chat message, confirm normal replies still work
and Convex logs stay silent on the happy path.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -c "sendMessage failed" convex/chatActions.ts` → 1
- [ ] `grep -c "slice(-150)" convex/chatInternal.ts` → 1
- [ ] Every `JSON.parse(` of tool-call arguments in `convex/chatActions.ts` is inside a try/catch
- [ ] `npx tsc --noEmit -p convex` exits 0; `pnpm lint` exits 0
- [ ] `git status` shows only the two in-scope files modified
- [ ] `plans/README.md` status row updated (note: needs Convex deploy, operator)

## STOP conditions

Stop and report back (do not improvise) if:

- The catch block or the parse sites have moved/changed vs the excerpts.
- `UserContext` is a validator-derived type that can't take a new field
  without touching `convex/validators.ts` — report; validators are a
  contract surface this plan must not widen silently.
- Degrading the first tool call requires changing `internal.chat.*` mutation
  signatures — out of scope; report.

## Maintenance notes

- The 150 cap is a starting bound, not science: the `ai_context_size` event
  now effectively caps `exerciseCount` at 150 — if PostHog later shows p95
  prompts still too large, the templates/history sections are the next
  candidates (see backlog.md LATER #2's trigger).
- Reviewer: confirm the degrade path can't create a `pendingApproval` with
  half-parsed JSON, and that no log line can contain user content.
- Deferred: retrying a truncated tool call with a follow-up completion
  (complexity not justified until it shows up in logs — which Step 1 now
  makes possible).
