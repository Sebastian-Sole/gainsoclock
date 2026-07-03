import * as Sentry from "@sentry/react-native";

/**
 * Client-side error reporting.
 *
 * `Sentry.wrap` in `app/_layout.tsx` auto-captures *unhandled* crashes and
 * rejections — but a Convex call or native SDK call that we `catch` for UX (a
 * toast, an error state) never reaches it. Route those handled failures
 * through here so they're visible in Sentry with a grouping tag.
 *
 * Both functions are safe no-ops when Sentry is disabled (no DSN in the build).
 */

/** Report a caught error (something threw). */
export function reportError(
  where: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const err = error instanceof Error ? error : new Error(String(error));
  Sentry.captureException(err, {
    tags: { where, source: "client-handled" },
    extra,
  });
}

/**
 * Report a stall — a hang or a timeout that resolved to a fallback. A hang is
 * the *absence* of an exception, so there's nothing for `captureException` to
 * catch; we synthesise a warning-level message instead. This is what makes a
 * "the paywall just spun forever" report show up in Sentry at all.
 */
export function reportStall(
  where: string,
  extra?: Record<string, unknown>,
): void {
  Sentry.captureMessage(`[stall] ${where}`, {
    level: "warning",
    tags: { where, source: "client-stall" },
    extra,
  });
}
