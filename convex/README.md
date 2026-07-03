# Welcome to your Convex functions directory!

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

A query function that takes two arguments looks like:

```ts
// convex/myFunctions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQueryFunction = query({
  // Validators for arguments.
  args: {
    first: v.number(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Read the database as many times as you need here.
    // See https://docs.convex.dev/database/reading-data.
    const documents = await ctx.db.query("tablename").collect();

    // Arguments passed from the client are properties of the args object.
    console.log(args.first, args.second);

    // Write arbitrary JavaScript here: filter, aggregate, build derived data,
    // remove non-public properties, or create new objects.
    return documents;
  },
});
```

Using this query function in a React component looks like:

```ts
const data = useQuery(api.myFunctions.myQueryFunction, {
  first: 10,
  second: "hello",
});
```

A mutation function looks like:

```ts
// convex/myFunctions.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const myMutationFunction = mutation({
  // Validators for arguments.
  args: {
    first: v.string(),
    second: v.string(),
  },

  // Function implementation.
  handler: async (ctx, args) => {
    // Insert or modify documents in the database here.
    // Mutations can also read from the database like queries.
    // See https://docs.convex.dev/database/writing-data.
    const message = { body: args.first, author: args.second };
    const id = await ctx.db.insert("messages", message);

    // Optionally, return a value from your mutation.
    return await ctx.db.get("messages", id);
  },
});
```

Using this mutation function in a React component looks like:

```ts
const mutation = useMutation(api.myFunctions.myMutationFunction);
function handleButtonPress() {
  // fire and forget, the most common way to use mutations
  mutation({ first: "Hello!", second: "me" });
  // OR
  // use the result once the mutation has completed
  mutation({ first: "Hello!", second: "me" }).then((result) =>
    console.log(result),
  );
}
```

Use the Convex CLI to push your functions to a deployment. See everything
the Convex CLI can do by running `npx convex -h` in your project root
directory. To learn more, launch the docs with `npx convex docs`.

## Why convex/package.json exists

The `"use node"` actions in this directory (`analytics.ts`, `chatActions.ts`,
`onboardingActions.ts`, `email.ts`, `posthogServer.ts`, `errorReporting.ts`)
are bundled by the Convex CLI, which resolves their third-party dependencies.
This manifest declares those dependencies explicitly. **Keep its version
ranges identical to the root `package.json`** — drift here means the
deployment runs a different version than local dev. Current pairs: `openai`,
`posthog-node`, `@sentry/node`.

## Error reporting (Sentry)

Convex's **native Sentry integration** (Deployment Settings → Integrations)
would forward every uncaught function exception with zero code — but it's a
**Pro-plan** feature. On the **Starter plan** we reach the same coverage in
code. The pieces:

**`errorReporting.ts` — the sink.** A `"use node"` `reportHandledError`
internalAction wrapping `@sentry/node` (capture-only init, `flush`, swallows
its own failures). Everything below ultimately schedules this.

**`errorBoundary.ts` — `reportServerError(ctx, where, error, level?)`.** A plain
helper (importable from V8 *and* Node actions) that schedules `reportHandledError`
then lets the caller re-throw. Reporting goes through the scheduler, which —
unlike inside a mutation — survives the re-throw, because **action** scheduling
isn't transactional. That single fact drives the whole design:

- **Crons → `cronRunner.ts`.** All 7 cron targets are `internalMutation`s, and a
  mutation that throws rolls back its own report. So `crons.ts` targets
  `internal.cronRunner.run` with a `job` key; the runner calls the mutation from
  an **action** boundary and reports on failure. Add a cron → add the literal in
  both files.
- **Scheduled deliveries.** `email.ts` (`sendViaResend`) and
  `weeklyReview.generateReviewForUser` run scheduled with no client watching, so
  they report via `reportServerError` before re-throwing.
- **Handled/recovered errors** (never re-thrown, so otherwise invisible):
  schedule `reportHandledError` directly. Wired at `chat.sendMessage`
  (chatActions), the RevenueCat webhook (`http.ts`), and
  `onboarding.ahaMoment.primaryModel` (onboardingActions, `warning`).
- **Client-invoked mutations/queries** are *not* covered here — their rejection
  reaches the client, where `lib/report-error.ts` + `Sentry.wrap` capture it.

> Residual Starter gap: a server-only mutation that isn't reached through one of
> the action boundaries above still can't self-report. The clean fix is the Pro
> native integration; until then, route new background mutations through an
> action boundary if their failure matters.

```ts
await ctx.scheduler.runAfter(0, internal.errorReporting.reportHandledError, {
  where: "chat.sendMessage",              // stable grouping key
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
  level: "warning",                        // optional; default "error"
  userId,                                  // optional
  extra: { conversationClientId },         // small, non-PII context only
});
```

### Convex env vars

Set on the server via `npx convex env set` (never the Expo `.env`):

- `SENTRY_DSN` — server Sentry project DSN. Unset = no-op (dev/preview safe).
- `SENTRY_ENVIRONMENT` — optional; defaults to `production`. Set to `development`
  on the dev deployment so its events are separable from prod.

If you later upgrade to Pro and enable the native integration, keep the code
paths above for *handled/recovered* errors (chat fallback, paywall stalls) — the
native integration only sees uncaught exceptions.
