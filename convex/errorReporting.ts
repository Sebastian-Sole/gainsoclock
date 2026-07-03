"use node";

import { v } from "convex/values";
import * as Sentry from "@sentry/node";

import { internalAction } from "./_generated/server";

/**
 * Server-side reporter for *handled* errors. Convex's native Sentry
 * integration (Deployment Settings → Integrations) only sees *uncaught*
 * exceptions — anything a function catches and recovers from (the chat
 * fallback message, the RevenueCat webhook 500 path, a degraded-but-recovered
 * onboarding model call) never reaches it. This internalAction is the escape
 * hatch: schedule it fire-and-forget from any catch site, in any runtime, to
 * forward the error to the same Sentry project with a `where` tag for grouping.
 *
 * Callable from V8 queries/mutations *and* Node actions because the caller only
 * uses `ctx.scheduler.runAfter(0, ...)` — the `@sentry/node` dependency stays
 * inside this "use node" module and never has to load in the default runtime.
 *
 * Mirrors `convex/analytics.ts` captureServer:
 *   - node-only, bounded by a flush timeout so reporting can't hang a caller;
 *   - swallows its own failures (warns) — error reporting must never bubble
 *     back into the function that called it;
 *   - reads `SENTRY_DSN` from Convex env; a no-op (warn) when unset, so dev and
 *     preview deployments without a DSN keep working.
 */

const FLUSH_TIMEOUT_MS = 2000;

let initialised = false;

function ensureInit(dsn: string): void {
  if (initialised) return;
  Sentry.init({
    dsn,
    // Capture-only: no OpenTelemetry / http auto-instrumentation, and — crucially
    // — no global onUncaughtException / onUnhandledRejection handlers. Convex's
    // native integration already owns uncaught errors; this path is for handled
    // ones, so installing process-level handlers here would risk double-reports.
    defaultIntegrations: false,
    environment: process.env.SENTRY_ENVIRONMENT ?? "production",
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
  initialised = true;
}

export const reportHandledError = internalAction({
  args: {
    // Stable grouping key for the callsite, e.g. "chat.sendMessage".
    where: v.string(),
    // Already-stringified error message (callers slice/redact as needed).
    message: v.string(),
    // Original stack, if the caught value was an Error — preserves grouping.
    stack: v.optional(v.string()),
    level: v.optional(
      v.union(v.literal("error"), v.literal("warning"), v.literal("fatal")),
    ),
    userId: v.optional(v.string()),
    // Small, non-PII context (ids / counts / model names only). Never body stats.
    extra: v.optional(v.any()),
  },
  handler: async (_ctx, { where, message, stack, level, userId, extra }) => {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn) {
      console.warn("[error-reporting] SENTRY_DSN not set; skipping handled-error report");
      return null;
    }

    try {
      ensureInit(dsn);

      // Reconstruct an Error so Sentry gets a real exception (with the original
      // stack, when the caller had one) rather than a bare message string.
      const err = new Error(message);
      if (stack) err.stack = stack;

      Sentry.captureException(err, {
        level: level ?? "error",
        tags: { where, source: "convex-handled" },
        user: userId ? { id: userId } : undefined,
        extra: extra && typeof extra === "object" ? extra : undefined,
      });

      await Sentry.flush(FLUSH_TIMEOUT_MS);
    } catch (e) {
      console.warn("[error-reporting] capture failed", e);
    }

    return null;
  },
});
