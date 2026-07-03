import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Fire-and-forget report of a server error from any ACTION (V8 or Node).
 *
 * Reporting goes through the scheduler, which — unlike inside a mutation — is
 * NOT transactional, so the report survives a subsequent re-throw. That's the
 * whole reason cron work and scheduled deliveries are routed through actions:
 * a mutation that throws would roll back its own error report.
 *
 * Plain helper (no "use node"), so both V8 actions (`cronRunner`) and Node
 * actions (`email`) can import it — the `@sentry/node` dependency stays inside
 * `errorReporting.ts`, reached here only as a scheduled function reference.
 *
 * Typical use: `catch (e) { await reportServerError(ctx, "cron.x", e); throw e; }`
 */
export async function reportServerError(
  ctx: ActionCtx,
  where: string,
  error: unknown,
  level: "error" | "warning" | "fatal" = "error",
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.errorReporting.reportHandledError, {
    where,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    level,
  });
}
